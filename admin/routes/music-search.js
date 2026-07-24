import { Router } from "express";
import ytSearch from "yt-search";
import ytdl from "@distube/ytdl-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "../utils/file-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const MUSIC_DIR = path.join(PROJECT_ROOT, "public/assets/music");

fs.mkdirSync(MUSIC_DIR, { recursive: true });

const router = Router();

// Search YouTube for music
router.get("/search", async (req, res) => {
	try {
		const query = req.query.q;
		if (!query) return res.status(400).json({ error: "Query is required" });

		const results = await ytSearch(query);
		const videos = results.videos
			.filter((v) => v.seconds < 600) // Only songs under 10 min
			.slice(0, 10)
			.map((v) => ({
				id: v.videoId,
				title: v.title,
				artist: v.author?.name || "Unknown",
				duration: v.seconds,
				durationStr: v.timestamp,
				thumbnail: v.thumbnail,
				url: v.url,
			}));

		res.json({ results: videos });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Download audio from YouTube and save to music library
router.post("/download", async (req, res) => {
	try {
		const { videoId, title, artist } = req.body;
		if (!videoId) return res.status(400).json({ error: "videoId is required" });

		const url = `https://www.youtube.com/watch?v=${videoId}`;
		const safeName = (title || "audio")
			.replace(/[^\w\s\-()]/g, "")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 80);
		const fileName = `${safeName}.mp3`;
		const filePath = path.join(MUSIC_DIR, fileName);

		// Stream and save audio
		const stream = ytdl(url, {
			filter: "audioonly",
			quality: "highestaudio",
		});

		const writeStream = fs.createWriteStream(filePath);

		stream.pipe(writeStream);

		await new Promise((resolve, reject) => {
			writeStream.on("finish", resolve);
			writeStream.on("error", reject);
			stream.on("error", reject);
		});

		// Update musicConfig.ts
		function esc(s) { return JSON.stringify(s || ""); }
		const entryLines = [
			"\t\t\t{",
			"\t\t\t\tname: " + esc(title || safeName) + ",",
			"\t\t\t\tartist: " + esc(artist || "Unknown") + ",",
			"\t\t\t\turl: " + esc("/assets/music/" + fileName) + ",",
			"\t\t\t\tcover: \"\",",
			"\t\t\t\tlrc: \"\",",
			"\t\t\t}",
		].join("\n");

		const configPath = "src/config/musicConfig.ts";
		const configContent = readFile(configPath);
		const playlistRegex = /(playlist:\s*\[)([\s\S]*?)(\])/;
		const match = configContent.match(playlistRegex);

		let configUpdated = false;
		if (match) {
			const newEntry = match[2].trim()
				? `\n${entryLines},${match[2]}`
				: `\n${entryLines},${match[2]}`;
			const newPlaylist = `playlist: [${newEntry}\n\t\t]`;
			const updated = configContent.replace(playlistRegex, newPlaylist);
			writeFile(configPath, updated);
			configUpdated = true;
		}

		res.json({
			success: true,
			file: fileName,
			configUpdated,
		});
	} catch (err) {
		// Clean up partial download on error
		const isBotError = err.message?.includes("Sign in") || err.message?.includes("bot") || err.message?.includes("confirm");
		res.status(500).json({
			error: isBotError
				? "YouTube blocked the download (bot detection). Use the mp3juice button next to each search result to download instead."
				: `Download failed: ${err.message}`,
			botBlocked: isBotError,
		});
	}
});

export default router;
