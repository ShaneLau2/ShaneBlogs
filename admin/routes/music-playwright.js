import { Router } from "express";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "../utils/file-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const MUSIC_DIR = path.join(PROJECT_ROOT, "public/assets/music");
fs.mkdirSync(MUSIC_DIR, { recursive: true });

const router = Router();

// Download via Playwright — automates mp3juice.sc in a real browser
router.post("/playwright-download", async (req, res) => {
	let browser;
	try {
		const { videoId, title } = req.body;
		if (!videoId) return res.status(400).json({ error: "videoId is required" });

		const safeName = (title || "audio")
			.replace(/[^\p{L}\p{N}\s\-()]/gu, "")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 80);
		const fileName = `${safeName}.mp3`;
		const filePath = path.join(MUSIC_DIR, fileName);

		// Launch browser
		browser = await chromium.launch({ headless: true });
		const context = await browser.newContext({
			acceptDownloads: true,
			userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
		});
		const page = await context.newPage();

		// Navigate to mp3juice with the YouTube URL
		const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
		await page.goto("https://mp3juice.sc/", { waitUntil: "networkidle" });

		// Fill search and submit
		await page.fill("#query", youtubeUrl);
		await page.click('button[type="submit"]');

		// Wait for results and click first MP3 download
		await page.waitForSelector(".result", { timeout: 15000 });
		await page.click('.result:first-child a[data-format="mp3"]');

		// Wait for download to start — the button text changes through "checking" -> "extracting" -> "converting" -> "Download"
		try {
			await page.waitForFunction(
				() => {
					const btn = document.querySelector('.result:first-child a[data-format="mp3"]');
					return btn && btn.textContent === "Download";
				},
				{ timeout: 60000 },
			);
		} catch {
			// Sometimes the download starts directly as a file
		}

		// Click the Download link
		const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
		await page.click('.result:first-child a[data-format="mp3"]');

		const download = await downloadPromise;
		await download.saveAs(filePath);

		await browser.close();
		browser = null;

		// Verify file downloaded
		if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 1000) {
			throw new Error("Downloaded file is too small or missing");
		}

		// Update playlist config
		const esc = (s) => JSON.stringify(s || "");
		const entryLines = [
			"\t\t\t{",
			"\t\t\t\tname: " + esc(title || safeName) + ",",
			"\t\t\t\tartist: " + esc("Unknown") + ",",
			"\t\t\t\turl: " + esc("/assets/music/" + fileName) + ",",
			"\t\t\t\tcover: \"\",",
			"\t\t\t\tlrc: \"\",",
			"\t\t\t}",
		].join("\n");

		const configPath = "src/config/musicConfig.ts";
		const configContent = readFile(configPath);
		let configUpdated = false;
		let existingRaw = "";
		const ps = configContent.indexOf("playlist: [");
		if (ps !== -1) {
			let braceDepth = 0, bracketDepth = 0, endPos = -1;
			const inner = configContent.slice(ps + "playlist: [".length);
			for (let i = 0; i < inner.length; i++) {
				const ch = inner[i];
				if (ch === "{") braceDepth++;
				if (ch === "}") braceDepth--;
				if (ch === "[") bracketDepth++;
				if (ch === "]") {
					if (braceDepth === 0 && bracketDepth === 0) { endPos = i; break; }
					bracketDepth--;
				}
			}
			if (endPos !== -1) existingRaw = inner.slice(0, endPos).trim();
		}
		const hasExisting = existingRaw.length > 0;
		const allEntries = hasExisting ? `${entryLines},\n${existingRaw}` : `${entryLines}`;
		const header = configContent.slice(0, configContent.indexOf("local:"));
		const updated = `${header}\tlocal: {\n\t\tplaylist: [\n${allEntries}\n\t\t],\n\t},\n};`;
		if (ps !== -1) { writeFile(configPath, updated); configUpdated = true; }

		res.json({ success: true, file: fileName, configUpdated });
	} catch (err) {
		if (browser) await browser.close().catch(() => {});
		res.status(500).json({ error: `Download failed: ${err.message}` });
	}
});

export default router;
