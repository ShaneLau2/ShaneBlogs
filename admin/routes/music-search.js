import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "../utils/file-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const MUSIC_DIR = path.join(PROJECT_ROOT, "public/assets/music");

fs.mkdirSync(MUSIC_DIR, { recursive: true });

const router = Router();
const MP3JUICE = "https://mp3juice.sc";

// Search via mp3juice API
router.get("/mp3juice-search", async (req, res) => {
	try {
		const query = req.query.q;
		if (!query) return res.status(400).json({ error: "Query is required" });

		const b64 = Buffer.from(encodeURIComponent(query)).toString("base64");
		const url = `${MP3JUICE}/api/v1/search?y=y&q=${b64}&_=${Date.now()}`;

		const response = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
				Referer: "https://mp3juice.sc/",
			},
		});
		if (!response.ok) throw new Error(`mp3juice returned ${response.status}`);

		const data = await response.json();
		const results = (data.yt || []).slice(0, 10).map((v) => ({
			id: v.id,
			title: v.title,
			duration: v.duration,
			source: "youtube",
		}));

		res.json({ results });
	} catch (err) {
		res.status(500).json({ error: `Search failed: ${err.message}` });
	}
});

// Download via mp3juice pipeline
router.post("/download", async (req, res) => {
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

		// Headers that mimic mp3juice.sc browser request
		const h = {
			Origin: "https://mp3juice.sc",
			Referer: "https://mp3juice.sc/",
			"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
		};

		// Step 1: Auth
		const authRes = await fetch(`https://theta.thetacloud.org/api/v1/auth?_=${Date.now()}`, { headers: h });
		if (!authRes.ok) throw new Error(`Auth failed: ${authRes.status}`);
		const auth = await authRes.json();
		if (auth.error) throw new Error(`Auth error: ${auth.error}`);

		// Step 2: Init
		const initRes = await fetch(`https://theta.thetacloud.org/api/v1/init?_=${Date.now()}`, {
			headers: { ...h, Authorization: `Bearer ${auth.key}` },
		});
		if (!initRes.ok) throw new Error(`Init failed: ${initRes.status}`);
		const init = await initRes.json();
		if (init.error) throw new Error(`Init error: ${init.error}`);

		// Step 3: Convert
		const convertUrl = init.convertURL.includes("?")
			? `${init.convertURL}&v=${videoId}&f=mp3&_=${Date.now()}`
			: `${init.convertURL}?v=${videoId}&f=mp3&_=${Date.now()}`;
		const convRes = await fetch(convertUrl, { headers: h });
		if (!convRes.ok) throw new Error(`Convert failed: ${convRes.status}`);
		const conv = await convRes.json();
		if (conv.error) throw new Error(`Convert error: ${conv.error}`);

		// Step 4: Handle redirect or get download URL
		let downloadUrl = conv.downloadURL;
		if (conv.redirect && conv.redirectURL) {
			const redirectUrl = conv.redirectURL.includes("?")
				? `${conv.redirectURL}&v=${videoId}&f=mp3&_=${Date.now()}`
				: `${conv.redirectURL}?v=${videoId}&f=mp3&_=${Date.now()}`;
			const redirRes = await fetch(redirectUrl, { headers: h });
			if (redirRes.ok) {
				const redir = await redirRes.json();
				downloadUrl = redir.downloadURL || downloadUrl;
			}
		}

		if (!downloadUrl) throw new Error("Could not get download URL");

		// Step 5: Download the actual MP3
		const finalUrl = `${downloadUrl}&v=${videoId}&f=mp3&r=mp3juice.sc`;
		const dlRes = await fetch(finalUrl, { headers: h });
		if (!dlRes.ok) throw new Error(`Download failed: HTTP ${dlRes.status}`);

		const buffer = Buffer.from(await dlRes.arrayBuffer());
		fs.writeFileSync(filePath, buffer);

		// Step 6: Update playlist config
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
		res.status(500).json({ error: `Download failed: ${err.message}` });
	}
});

export default router;
