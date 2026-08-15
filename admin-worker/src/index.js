/**
 * Firefly Admin Auth Worker
 *
 * Replaces the old "password + personal access token" scheme of the online
 * admin panel with GitHub OAuth:
 *
 *   1. The static SPA redirects the browser to /api/oauth/authorize.
 *   2. The user authorizes the OAuth app on github.com (choose ONLY the blog
 *      repository when asked which repos the app may access).
 *   3. /api/oauth/callback exchanges the code for a token server-side,
 *      verifies the account is the blog owner (ADMIN_LOGIN), and stores the
 *      token in an AES-GCM encrypted, HttpOnly, SameSite=None cookie.
 *   4. All GitHub API calls from the SPA go through /api/gh/*, where the
 *      worker injects the token. The browser never sees the token.
 *
 * Environment:
 *   GITHUB_CLIENT_ID     (var)    GitHub OAuth App client id
 *   GITHUB_CLIENT_SECRET (secret) GitHub OAuth App client secret
 *   AUTH_SECRET          (secret) key used to encrypt session cookies
 *   ADMIN_LOGIN          (var)    GitHub login allowed to manage the blog
 *   APP_URL              (var)    origin of the blog, e.g. https://shanelau2.github.io/ShaneBlogs
 *   OAUTH_SCOPE          (var)    optional, default "repo"
 *   SESSION_TTL          (var)    session lifetime in seconds, default 86400
 *   COOKIE_SECURE        (var)    set "false" for local http testing
 */

const GH_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GH_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GH_API = "https://api.github.com";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function json(data, status = 200, headers = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json", ...headers },
	});
}

function corsHeaders(env, request) {
	const origin = request?.headers?.get("Origin");
	// Browsers send Origin as scheme+host+port only (never a path), so
	// compare against APP_URL's origin and echo the request Origin when it
	// matches — echoing the full APP_URL would fail the CORS check.
	const appOrigin = env.APP_URL ? new URL(env.APP_URL).origin : null;
	const allow =
		origin && appOrigin && origin === appOrigin ? origin : env.APP_URL || origin || "*";
	return {
		"Access-Control-Allow-Origin": allow,
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers":
			"Content-Type, Accept, If-None-Match, X-GitHub-Api-Version, Authorization",
		"Access-Control-Max-Age": "86400",
		Vary: "Origin",
	};
}

function cookieHeader(name, value, opts = {}) {
	const secure = opts.secure ?? true;
	const parts = [
		`${name}=${encodeURIComponent(value)}`,
		"Path=/",
		`Max-Age=${opts.maxAge ?? 3600}`,
		opts.httpOnly ? "HttpOnly" : null,
		secure ? "Secure" : null,
		`SameSite=${opts.sameSite ?? "Lax"}`,
	].filter(Boolean);
	return parts.join("; ");
}

function getCookie(request, name) {
	const match = request.headers
		.get("Cookie")
		?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
	return match ? decodeURIComponent(match[1]) : null;
}

async function deriveKey(secret) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		encoder.encode(secret || "insecure-default"),
	);
	return crypto.subtle.importKey(
		"raw",
		digest,
		{ name: "AES-GCM" },
		false,
		["encrypt", "decrypt"],
	);
}

/** AES-GCM encrypt a JSON payload; returns a base64url string. */
export async function encryptSession(secret, payload) {
	const key = await deriveKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		encoder.encode(JSON.stringify(payload)),
	);
	const out = new Uint8Array(iv.length + ciphertext.byteLength);
	out.set(iv, 0);
	out.set(new Uint8Array(ciphertext), iv.length);
	return btoa(String.fromCharCode(...out))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** Decrypt a session cookie created by encryptSession; null on any failure. */
export async function decryptSession(secret, cookie) {
	try {
		const raw = atob(cookie.replace(/-/g, "+").replace(/_/g, "/"));
		const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
		const key = await deriveKey(secret);
		const iv = bytes.slice(0, 12);
		const ciphertext = bytes.slice(12);
		const plain = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv },
			key,
			ciphertext,
		);
		return JSON.parse(decoder.decode(plain));
	} catch {
		return null;
	}
}

async function getSession(env, request) {
	// Accept the session either as the admin_session cookie or as a
	// "Bearer <token>" header. The SPA relies on the header cross-origin
	// (github.io → workers.dev), where third-party cookies are routinely
	// blocked by browsers.
	let raw = getCookie(request, "admin_session");
	const auth = request.headers.get("Authorization");
	if (!raw && auth?.startsWith("Bearer ")) raw = auth.slice(7);
	if (!raw) return null;
	const session = await decryptSession(env.AUTH_SECRET, raw);
	if (!session || !session.token) return null;
	if (session.exp && session.exp < Date.now()) return null;
	const allowed = (env.ADMIN_LOGIN || "").toLowerCase();
	if (allowed && session.login?.toLowerCase() !== allowed) return null;
	return session;
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

/** GET /api/oauth/authorize — redirect to GitHub with a state cookie. */
async function authorize(env, request, url) {
	const state = crypto.randomUUID();
	const redirectUri = `${url.origin}/api/oauth/callback`;
	const params = new URLSearchParams({
		client_id: env.GITHUB_CLIENT_ID,
		redirect_uri: redirectUri,
		scope: env.OAUTH_SCOPE || "repo",
		state,
		allow_signup: "false",
	});
	// Manually build the 302 so we can append Set-Cookie (Response.redirect
	// returns a response with immutable headers).
	const res = new Response(null, {
		status: 302,
		headers: { Location: `${GH_AUTHORIZE}?${params.toString()}` },
	});
	res.headers.append(
		"Set-Cookie",
		cookieHeader("oauth_state", state, {
			maxAge: 600,
			httpOnly: true,
			sameSite: "Lax",
			secure: env.COOKIE_SECURE !== "false",
		}),
	);
	return res;
}

/** GET /api/oauth/callback — exchange code, verify owner, set session. */
async function callback(env, request, url) {
	const cors = corsHeaders(env, request);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const savedState = getCookie(request, "oauth_state");

	if (!code) return json({ error: "Missing authorization code" }, 400, cors);
	if (!state || !savedState || state !== savedState) {
		return json({ error: "Invalid OAuth state" }, 403, cors);
	}

	const redirectUri = `${url.origin}/api/oauth/callback`;
	const tokenRes = await fetch(GH_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({
			client_id: env.GITHUB_CLIENT_ID,
			client_secret: env.GITHUB_CLIENT_SECRET,
			code,
			redirect_uri: redirectUri,
		}),
	});
	const tokenData = await tokenRes.json();
	if (!tokenData.access_token) {
		return json(
			{ error: `OAuth failed: ${tokenData.error_description || tokenData.error || "unknown"}` },
			400,
			cors,
		);
	}

	// Verify the authenticated account is the blog owner.
	const userRes = await fetch(`${GH_API}/user`, {
		headers: {
			Authorization: `Bearer ${tokenData.access_token}`,
			"User-Agent": "firefly-admin-auth",
		},
	});
	const user = await userRes.json();
	const allowed = (env.ADMIN_LOGIN || "").toLowerCase();
	if (!allowed || user.login?.toLowerCase() !== allowed) {
		return json(
			{ error: "This GitHub account is not authorized to manage the blog" },
			403,
			cors,
		);
	}

	const ttl = Number(env.SESSION_TTL || 86400);
	const session = {
		login: user.login,
		token: tokenData.access_token,
		exp: Date.now() + ttl * 1000,
	};
	const encrypted = await encryptSession(env.AUTH_SECRET, session);

	// Deliver the session to the SPA via a URL fragment (never a query
	// string) so the panel can authenticate with an Authorization header
	// instead of relying on a cross-site cookie.
	const target = `${env.APP_URL || url.origin}/admin/#session=${encodeURIComponent(encrypted)}`;
	const res = new Response(null, { status: 302, headers: { Location: target } });
	res.headers.append(
		"Set-Cookie",
		cookieHeader("admin_session", encrypted, {
			maxAge: ttl,
			httpOnly: true,
			sameSite: "None",
			secure: true,
		}),
	);
	res.headers.append(
		"Set-Cookie",
		cookieHeader("oauth_state", "", {
			maxAge: 0,
			httpOnly: true,
			sameSite: "Lax",
			secure: env.COOKIE_SECURE !== "false",
		}),
	);
	return res;
}

/** GET /api/me — current session info (or 401). */
async function me(env, request) {
	const cors = corsHeaders(env, request);
	const session = await getSession(env, request);
	if (!session) return json({ error: "Unauthorized" }, 401, cors);
	return json({ login: session.login }, 200, cors);
}

/** POST /api/logout — clear the session cookie. */
async function logout(env, request) {
	const res = json({ success: true }, 200, corsHeaders(env, request));
	res.headers.append(
		"Set-Cookie",
		cookieHeader("admin_session", "", {
			maxAge: 0,
			httpOnly: true,
			sameSite: "None",
			secure: true,
		}),
	);
	return res;
}

/** /api/gh/* — proxy to api.github.com with the session token injected. */
async function proxy(env, request, url) {
	const cors = corsHeaders(env, request);
	const session = await getSession(env, request);
	if (!session) return json({ error: "Unauthorized" }, 401, cors);

	const ghPath = url.pathname.slice("/api/gh".length);
	const target = `${GH_API}${ghPath}${url.search}`;
	const headers = {
		Authorization: `Bearer ${session.token}`,
		"User-Agent": "firefly-admin-auth",
		Accept: request.headers.get("Accept") || "application/vnd.github+json",
	};
	const contentType = request.headers.get("Content-Type");
	if (contentType) headers["Content-Type"] = contentType;
	const ifNoneMatch = request.headers.get("If-None-Match");
	if (ifNoneMatch) headers["If-None-Match"] = ifNoneMatch;

	const body =
		request.method === "GET" || request.method === "HEAD"
			? undefined
			: await request.arrayBuffer();

	const upstream = await fetch(target, {
		method: request.method,
		headers,
		body,
		redirect: "follow",
	});

	const res = new Response(upstream.body, {
		status: upstream.status,
		headers: upstream.headers,
	});
	for (const [key, value] of Object.entries(cors)) {
		res.headers.set(key, value);
	}
	return res;
}

/* ------------------------------------------------------------------ */
/* Music search / download (online mode)                               */
/* ------------------------------------------------------------------ */

const MP3JUICE = "https://mp3juice.sc";
const MP3_BROWSER_HEADERS = {
	Origin: MP3JUICE,
	Referer: `${MP3JUICE}/`,
	"User-Agent":
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
};

/** GET /api/music/search?q= — search mp3juice for songs. */
async function musicSearch(env, request, url) {
	const cors = corsHeaders(env, request);
	const session = await getSession(env, request);
	if (!session) return json({ error: "Unauthorized" }, 401, cors);

	const query = url.searchParams.get("q");
	if (!query) return json({ error: "Query is required" }, 400, cors);

	try {
		const b64 = btoa(encodeURIComponent(query));
		const target = `${MP3JUICE}/api/v1/search?y=y&q=${b64}&_=${Date.now()}`;
		const response = await fetch(target, { headers: MP3_BROWSER_HEADERS });
		if (!response.ok) throw new Error(`mp3juice returned ${response.status}`);
		const data = await response.json();
		const results = (data.yt || []).slice(0, 10).map((v) => ({
			id: v.id,
			title: v.title,
			duration: v.duration,
			source: "youtube",
		}));
		return json({ results }, 200, cors);
	} catch (err) {
		return json({ error: `Search failed: ${err.message}` }, 500, cors);
	}
}

function base64FromBytes(bytes) {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

async function ghJson(headers, target, init = {}) {
	const res = await fetch(target, { ...init, headers });
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`GitHub ${res.status}: ${text.slice(0, 300)}`);
	}
	return res.json();
}

/**
 * POST /api/music/download — download an MP3 via mp3juice and push it to
 * the blog repo, then add it to the structured playlist.
 *
 * Body: { videoId, title, repo, branch }
 */
async function musicDownload(env, request) {
	const cors = corsHeaders(env, request);
	const session = await getSession(env, request);
	if (!session) return json({ error: "Unauthorized" }, 401, cors);

	let body = {};
	try {
		body = await request.json();
	} catch {}
	const { videoId, title, repo, branch } = body;
	if (!videoId) return json({ error: "videoId is required" }, 400, cors);
	if (!repo || !branch) {
		return json({ error: "repo and branch are required" }, 400, cors);
	}

	const safeName = (title || "audio")
		.replace(/[^\p{L}\p{N}\s\-()]/gu, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80);
	const fileName = `${safeName}.mp3`;

	try {
		// 1. Auth
		const authRes = await fetch(`https://theta.thetacloud.org/api/v1/auth?_=${Date.now()}`, {
			headers: MP3_BROWSER_HEADERS,
		});
		if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status}`);
		const auth = await authRes.json();
		if (auth.error) throw new Error(`Auth error: ${auth.error}`);

		// 2. Init
		const initRes = await fetch(`https://theta.thetacloud.org/api/v1/init?_=${Date.now()}`, {
			headers: { ...MP3_BROWSER_HEADERS, Authorization: `Bearer ${auth.key}` },
		});
		if (!initRes.ok) throw new Error(`Init failed: ${initRes.status}`);
		const init = await initRes.json();
		if (init.error) throw new Error(`Init error: ${init.error}`);

		// 3. Convert
		const convertUrl = init.convertURL.includes("?")
			? `${init.convertURL}&v=${videoId}&f=mp3&_=${Date.now()}`
			: `${init.convertURL}?v=${videoId}&f=mp3&_=${Date.now()}`;
		const convRes = await fetch(convertUrl, { headers: MP3_BROWSER_HEADERS });
		if (!convRes.ok) throw new Error(`Convert failed: ${convRes.status}`);
		const conv = await convRes.json();
		if (conv.error) throw new Error(`Convert error: ${conv.error}`);

		// 4. Follow redirect if present
		let downloadUrl = conv.downloadURL;
		if (conv.redirect && conv.redirectURL) {
			const redirectUrl = conv.redirectURL.includes("?")
				? `${conv.redirectURL}&v=${videoId}&f=mp3&_=${Date.now()}`
				: `${conv.redirectURL}?v=${videoId}&f=mp3&_=${Date.now()}`;
			const redirRes = await fetch(redirectUrl, { headers: MP3_BROWSER_HEADERS });
			if (redirRes.ok) {
				const redir = await redirRes.json();
				downloadUrl = redir.downloadURL || downloadUrl;
			}
		}
		if (!downloadUrl) throw new Error("Could not get download URL");

		// 5. Download the MP3
		const finalUrl = `${downloadUrl}&v=${videoId}&f=mp3&r=mp3juice.sc`;
		const dlRes = await fetch(finalUrl, { headers: MP3_BROWSER_HEADERS });
		if (!dlRes.ok) throw new Error(`Download failed: HTTP ${dlRes.status}`);
		const bytes = new Uint8Array(await dlRes.arrayBuffer());
		if (bytes.length < 1000) throw new Error("Downloaded file is too small or missing");
		if (bytes.length > 60 * 1024 * 1024) throw new Error("Downloaded file exceeds 60MB");

		// 6. Upload the file to the repo (contents API, base64)
		const ghHeaders = {
			Authorization: `Bearer ${session.token}`,
			"User-Agent": "firefly-admin-auth",
			Accept: "application/vnd.github+json",
			"Content-Type": "application/json",
		};
		const musicPath = `public/assets/music/${fileName}`;
		const encodedPath = musicPath.split("/").map(encodeURIComponent).join("/");
		let sha;
		try {
			const existing = await fetch(
				`${GH_API}/repos/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
				{ headers: ghHeaders },
			);
			if (existing.ok) sha = (await existing.json()).sha;
		} catch {}
		await ghJson(
			ghHeaders,
			`${GH_API}/repos/${repo}/contents/${encodedPath}`,
			{
				method: "PUT",
				body: JSON.stringify({
					message: `Add music: ${safeName}`,
					content: base64FromBytes(bytes),
					sha,
					branch,
				}),
			},
		);

		// 7. Update the structured playlist
		const playlistPath = "src/data/music-playlist.json";
		const encPlaylistPath = playlistPath.split("/").map(encodeURIComponent).join("/");
		let playlist = [];
		let plSha;
		try {
			const existing = await fetch(
				`${GH_API}/repos/${repo}/contents/${encPlaylistPath}?ref=${encodeURIComponent(branch)}`,
				{ headers: ghHeaders },
			);
			if (existing.ok) {
				const file = await existing.json();
				plSha = file.sha;
				try {
					const raw = atob(file.content.replace(/\n/g, ""));
					const decoded = decodeURIComponent(escape(raw));
					playlist = JSON.parse(decoded);
				} catch {}
			}
		} catch {}
		if (!Array.isArray(playlist)) playlist = [];
		playlist.unshift({
			name: title || safeName,
			artist: "Unknown",
			url: `/assets/music/${fileName}`,
			cover: "",
			lrc: "",
		});
		const playlistContent = JSON.stringify(playlist, null, "\t") + "\n";
		const utf8 = unescape(encodeURIComponent(playlistContent));
		await ghJson(
			ghHeaders,
			`${GH_API}/repos/${repo}/contents/${encPlaylistPath}`,
			{
				method: "PUT",
				body: JSON.stringify({
					message: "Add music: " + (title || safeName),
					content: btoa(utf8),
					sha: plSha,
					branch,
				}),
			},
		);

		return json(
			{ success: true, file: fileName, configUpdated: true },
			200,
			cors,
		);
	} catch (err) {
		return json({ error: `Download failed: ${err.message}` }, 500, cors);
	}
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const path = url.pathname;

		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders(env, request),
			});
		}
		if (path === "/api/oauth/authorize") return authorize(env, request, url);
		if (path === "/api/oauth/callback") return callback(env, request, url);
		if (path === "/api/logout") return logout(env, request);
		if (path === "/api/me") return me(env, request);
		if (path.startsWith("/api/gh/")) return proxy(env, request, url);
		if (path === "/api/music/search") return musicSearch(env, request, url);
		if (path === "/api/music/download") return musicDownload(env, request);
		return json({ error: "Not found" }, 404, corsHeaders(env, request));
	},
};
