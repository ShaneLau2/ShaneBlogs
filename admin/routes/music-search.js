import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addToPlaylist } from "../utils/music-playlist.js";

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

		// Step 6: Add to the structured playlist data file
		addToPlaylist({
			name: title || safeName,
			artist: "Unknown",
			url: "/assets/music/" + fileName,
			cover: "",
			lrc: "",
		});

		res.json({ success: true, file: fileName, configUpdated: true });
	} catch (err) {
		res.status(500).json({ error: `Download failed: ${err.message}` });
	}
});

export default router;
