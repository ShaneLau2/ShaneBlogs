/**
 * Local smoke tests for the admin auth worker.
 *
 * Runs the worker's fetch handler against mocked GitHub endpoints so no real
 * OAuth credentials are needed:
 *
 *   node admin-worker/test.mjs
 */
import worker, { encryptSession } from "./src/index.js";

const ENV = {
	GITHUB_CLIENT_ID: "test-client-id",
	GITHUB_CLIENT_SECRET: "test-client-secret",
	AUTH_SECRET: "test-auth-secret",
	ADMIN_LOGIN: "ShaneLau2",
	APP_URL: "https://shanelau2.github.io/ShaneBlogs",
	OAUTH_SCOPE: "repo",
	SESSION_TTL: "86400",
};

let passed = 0;
let failed = 0;

function check(name, cond, extra = "") {
	if (cond) {
		passed++;
		console.log(`  ✅ ${name}`);
	} else {
		failed++;
		console.log(`  ❌ ${name} ${extra}`);
	}
}

function req(path, init = {}) {
	const url = `https://firefly-admin-auth.test.workers.dev${path}`;
	const headers = new Headers(init.headers || {});
	headers.set("Origin", ENV.APP_URL);
	return new Request(url, { ...init, headers });
}

async function call(path, init) {
	return worker.fetch(req(path, init), ENV);
}

// Stub GitHub API so tests never touch the network.
const realFetch = globalThis.fetch;
const githubCalls = [];
globalThis.fetch = async (url, init = {}) => {
	const u = String(url);
	githubCalls.push({ url: u, init });
	if (u.includes("api.github.com/user")) {
		return new Response(JSON.stringify({ login: "ShaneLau2" }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}
	if (u.includes("github.com/login/oauth/access_token")) {
		return new Response(
			JSON.stringify({ access_token: "gho_oauth_token", scope: "repo" }),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	}
	if (u.includes("api.github.com/repos/x")) {
		return new Response(JSON.stringify({ message: "ok", name: "ShaneBlogs" }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}
	return new Response(JSON.stringify({ error: "unexpected url" }), {
		status: 500,
		headers: { "Content-Type": "application/json" },
	});
};

try {
	console.log("\n— Unauthenticated routes —");

	let res = await call("/api/me");
	check("GET /api/me without cookie → 401", res.status === 401);

	res = await call("/api/gh/repos/ShaneLau2/ShaneBlogs");
	check("GET /api/gh/* without cookie → 401", res.status === 401);

	res = await call("/api/nope");
	check("unknown route → 404", res.status === 404);

	res = await call("/api/oauth/authorize", { redirect: "manual" });
	check("authorize → 302", res.status === 302);
	const loc = res.headers.get("Location") || "";
	check(
		"authorize → github.com/login/oauth/authorize",
		loc.startsWith("https://github.com/login/oauth/authorize"),
	);
	check(
		"authorize → carries state + redirect_uri + scope",
		loc.includes("state=") &&
			loc.includes(`redirect_uri=${encodeURIComponent("https://firefly-admin-auth.test.workers.dev/api/oauth/callback")}`) &&
			loc.includes("scope=repo"),
	);
	const stateCookie = res.headers
		.get("Set-Cookie")
		?.split(";")[0]
		.replace("oauth_state=", "");
	check("authorize → sets oauth_state cookie", !!stateCookie);

	console.log("\n— CORS —");

	res = await call("/api/me", { method: "OPTIONS" });
	check("OPTIONS preflight → 204", res.status === 204);
	check(
		"preflight → allows credentials",
		res.headers.get("Access-Control-Allow-Credentials") === "true",
	);
	check(
		"preflight → allow-origin matches APP_URL",
		res.headers.get("Access-Control-Allow-Origin") === ENV.APP_URL,
	);

	console.log("\n— OAuth callback —");

	// Wrong state → 403
	res = await call(
		"/api/oauth/callback?code=abc&state=wrong",
		{ headers: { Cookie: "oauth_state=right" } },
	);
	check("callback with mismatched state → 403", res.status === 403);

	// Correct state + code → redirect with session cookie
	res = await call(
		"/api/oauth/callback?code=abc&state=ok",
		{ headers: { Cookie: "oauth_state=ok" }, redirect: "manual" },
	);
	check("callback → 302 back to admin", res.status === 302);
	check(
		"callback → redirects to APP_URL/admin/",
		(res.headers.get("Location") || "").startsWith(ENV.APP_URL + "/admin/"),
	);
	const setCookie = res.headers.get("Set-Cookie") || "";
	check("callback → sets admin_session cookie", setCookie.includes("admin_session="));
	check(
		"callback → cookie is HttpOnly",
		setCookie.includes("HttpOnly") && setCookie.includes("SameSite=None"),
	);
	check(
		"callback → exchanged code via GitHub",
		githubCalls.some((c) => c.url === "https://github.com/login/oauth/access_token"),
	);

	console.log("\n— Authenticated session —");

	const session = { login: "ShaneLau2", token: "gho_test_token", exp: Date.now() + 60000 };
	const encrypted = await encryptSession(ENV.AUTH_SECRET, session);
	const authCookie = `admin_session=${encrypted}`;

	res = await call("/api/me", { headers: { Cookie: authCookie } });
	check("GET /api/me with valid session → 200", res.status === 200);
	check(
		"me → returns login",
		(await res.json()).login === "ShaneLau2",
	);

	githubCalls.length = 0;
	res = await call("/api/gh/repos/x/contents/foo.md", {
		method: "PUT",
		headers: { Cookie: authCookie, "Content-Type": "application/json" },
		body: JSON.stringify({ message: "test", content: "aGk=" }),
	});
	check("proxy PUT → 200", res.status === 200);
	const proxied = githubCalls.find((c) => c.url.includes("api.github.com/repos/x"));
	check(
		"proxy → forwards path + query to api.github.com",
		!!proxied && proxied.url === "https://api.github.com/repos/x/contents/foo.md",
	);
	check(
		"proxy → injects Bearer token",
		proxied?.init?.headers?.Authorization === "Bearer gho_test_token",
	);
	const bodyText = proxied?.init?.body
		? new TextDecoder().decode(new Uint8Array(proxied.init.body))
		: "";
	check(
		"proxy → preserves body",
		bodyText.includes('"message":"test"') && bodyText.includes('"content":"aGk="'),
	);
	check(
		"proxy → adds CORS headers to response",
		res.headers.get("Access-Control-Allow-Origin") === ENV.APP_URL,
	);

	console.log("\n— Unauthorized owner —");

	// Simulate a different user logging in
	globalThis.fetch = async (url, init = {}) => {
		const u = String(url);
		if (u.includes("github.com/login/oauth/access_token")) {
			return new Response(JSON.stringify({ access_token: "gho_evil" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (u.includes("api.github.com/user")) {
			return new Response(JSON.stringify({ login: "SomeAttacker" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
	};
	res = await call(
		"/api/oauth/callback?code=abc&state=ok",
		{ headers: { Cookie: "oauth_state=ok" } },
	);
	check("callback from non-owner account → 403", res.status === 403);

	console.log("\n— Expired session —");

	const expired = { login: "ShaneLau2", token: "gho_x", exp: Date.now() - 1000 };
	const encExpired = await encryptSession(ENV.AUTH_SECRET, expired);
	res = await call("/api/me", {
		headers: { Cookie: `admin_session=${encExpired}` },
	});
	check("expired session → 401", res.status === 401);

	console.log("\n— Logout —");

	res = await call("/api/logout", { method: "POST" });
	check("logout → 200", res.status === 200);
	check(
		"logout → clears cookie (Max-Age=0)",
		(res.headers.get("Set-Cookie") || "").includes("Max-Age=0"),
	);
} finally {
	globalThis.fetch = realFetch;
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
