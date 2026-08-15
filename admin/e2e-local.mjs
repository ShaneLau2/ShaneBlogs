/**
 * End-to-end test for the merged admin SPA in LOCAL mode.
 *
 * Boots the Express server itself (with a test password), drives the UI with
 * Playwright, and walks every page. Run from the repo root:
 *
 *   node admin/e2e-local.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = 3459;
const PASSWORD = "testpass";
const HASH = crypto.createHash("sha256").update(PASSWORD).digest("hex");

let server;
let browser;
let failed = 0;

function check(name, cond, extra = "") {
	if (cond) {
		console.log(`  ✅ ${name}`);
	} else {
		failed++;
		console.log(`  ❌ ${name} ${extra}`);
	}
}

try {
	console.log("\n— boot server —");
	server = spawn("node", ["server.js"], {
		cwd: __dirname,
		env: { ...process.env, ADMIN_PASSWORD_HASH: HASH, ADMIN_PORT: String(PORT) },
		stdio: "ignore",
	});
	await new Promise((r) => setTimeout(r, 1500));

	browser = await chromium.launch();
	const page = await browser.newPage();
	const errors = [];
	page.on("console", (m) => {
		if (m.type() === "error") errors.push("console: " + m.text());
	});
	page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

	// 1. Login
	console.log("\n— login —");
	await page.goto(`http://127.0.0.1:${PORT}/`);
	await page.waitForSelector("#login-form", { timeout: 5000 });
	await page.fill("#password", PASSWORD);
	await page.click("#login-form button[type=submit]");
	await page.waitForSelector(".sidebar-nav", { timeout: 5000 });
	const footer = await page.textContent("#login-status");
	check("logged in, local mode footer", footer.includes("Local mode"), `got: ${footer}`);

	// 2. Dashboard
	console.log("\n— dashboard —");
	await page.waitForSelector(".stat-card", { timeout: 8000 });
	const stats = await page.$$eval(".stat-card .value", (els) => els.map((e) => e.textContent));
	check("dashboard stats rendered", stats.length >= 4, JSON.stringify(stats));

	// 3. Walk every page
	console.log("\n— pages —");
	const pages = [
		["posts", "All Posts"],
		["dynamics", "Recent Dynamics"],
		["spec", "关于我"],
		["config", "siteConfig.ts"],
		["announcement", "announcementConfig.ts"],
		["music", "Music Files"],
		["deploy", "Sync to GitHub"],
	];
	for (const [p, needle] of pages) {
		await page.click(`.sidebar-nav [data-page="${p}"]`);
		await page.waitForFunction(
			(needle) => document.getElementById("page-content").textContent.includes(needle),
			needle,
			{ timeout: 8000 },
		);
		check(`page "${p}" renders`, true);
	}

	// 4. Posts page shows the welcome post
	await page.click('.sidebar-nav [data-page="posts"]');
	await page.waitForFunction(() => document.getElementById("page-content").textContent.includes("All Posts"));
	const postRows = await page.$$eval("#page-content tbody tr", (rows) => rows.map((r) => r.textContent));
	check("posts list non-empty", postRows.length >= 1, JSON.stringify(postRows));

	// 5. Dynamics: create → verify → delete (write path E2E)
	console.log("\n— dynamic create/delete round trip —");
	await page.click('.sidebar-nav [data-page="dynamics"]');
	await page.waitForSelector('#dynamic-form-card textarea[name="content"]');
	const countBefore = await page.$$eval("#page-content tbody tr", (rows) => rows.length);
	const marker = "e2e-roundtrip-" + Date.now();
	await page.fill('#dynamic-form-card textarea[name="content"]', marker);
	await page.click('#dynamic-form-card button[type="submit"]');
	await page.waitForFunction(
		(before) => document.querySelectorAll("#page-content tbody tr").length > before,
		countBefore,
		{ timeout: 8000 },
	);
	check("dynamic created via UI", true);
	const createdFile = fs
		.readdirSync(path.join(ROOT, "src/content/dynamic"))
		.find((f) => f.endsWith(".md") && fs.readFileSync(path.join(ROOT, "src/content/dynamic", f), "utf-8").includes(marker));
	check("dynamic file written", !!createdFile, `file: ${createdFile}`);
	if (createdFile) {
		// delete via the UI (list rows are keyed by slug)
		const slug = createdFile.replace(/\.md$/, "");
		const row = page.locator(`#page-content tbody tr:has-text("${slug}")`);
		page.on("dialog", (d) => d.accept());
		await row.locator("button.btn-danger").click();
		await page.waitForFunction(
			(before) => document.querySelectorAll("#page-content tbody tr").length === before,
			countBefore,
			{ timeout: 8000 },
		);
		check("dynamic deleted via UI", !fs.existsSync(path.join(ROOT, "src/content/dynamic", createdFile)));
	}

	// 6. Music page reads the structured playlist
	await page.click('.sidebar-nav [data-page="music"]');
	await page.waitForFunction(() => document.getElementById("page-content").textContent.includes("Playlist"));
	const musicText = await page.textContent("#page-content");
	check("music playlist rendered", musicText.includes("許嵩") || musicText.includes("Playlist (4)"), musicText.slice(0, 200));

	// 7. No console/page errors
	check("no console errors", errors.length === 0, errors.join(" | "));
} finally {
	if (browser) await browser.close().catch(() => {});
	if (server) server.kill("SIGTERM");
	// safety cleanup for the round-trip dynamic
	const dynamicDir = path.join(ROOT, "src/content/dynamic");
	for (const f of fs.readdirSync(dynamicDir)) {
		if (fs.readFileSync(path.join(dynamicDir, f), "utf-8").includes("e2e-roundtrip-")) {
			fs.unlinkSync(path.join(dynamicDir, f));
		}
	}
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll e2e checks passed");
process.exit(failed ? 1 : 0);
