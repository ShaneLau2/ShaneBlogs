import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "../utils/file-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const MUSIC_DIR = path.join(PROJECT_ROOT, "public/assets/music");
const COVER_DIR = path.join(MUSIC_DIR, "cover");

// Ensure directories exist
fs.mkdirSync(MUSIC_DIR, { recursive: true });
fs.mkdirSync(COVER_DIR, { recursive: true });

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		if (file.fieldname === "cover") {
			cb(null, COVER_DIR);
		} else {
			cb(null, MUSIC_DIR);
		}
	},
	filename: (req, file, cb) => {
		cb(null, file.originalname);
	},
});

const upload = multer({ storage });
const router = Router();

// List all music files
router.get("/", (req, res) => {
	try {
		const files = fs.readdirSync(MUSIC_DIR).filter((f) => /\.(mp3|flac|wav|ogg|m4a)$/i.test(f));
		const covers = fs.readdirSync(COVER_DIR).filter((f) => /\.(webp|png|jpg|jpeg|avif)$/i.test(f));
		res.json({ music: files, covers });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Upload a music file
router.post("/upload", upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]), (req, res) => {
	try {
		const result = {};
		if (req.files?.audio) result.audio = req.files.audio[0].originalname;
		if (req.files?.cover) result.cover = req.files.cover[0].originalname;
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Upload music + auto-add to config playlist
router.post("/upload-and-add", upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]), (req, res) => {
	try {
		const result = {};
		if (req.files?.audio) result.audio = req.files.audio[0].originalname;
		if (req.files?.cover) result.cover = req.files.cover[0].originalname;

		const songName = req.body.name || result.audio?.replace(/\.[^.]+$/, "") || "Unknown";
		const artist = req.body.artist || "Unknown";

		// Build playlist entry
		const entry = {
			name: songName,
			artist: artist,
			url: "/assets/music/" + result.audio,
			cover: result.cover ? "/assets/music/cover/" + result.cover : "",
			lrc: "",
		};

		// Read and update musicConfig.ts
		const configPath = "src/config/musicConfig.ts";
		const configContent = readFile(configPath);

		// Find the playlist array in the local section
		const playlistRegex = /(playlist:\s*\[)([\s\S]*?)(\])/;
		const match = configContent.match(playlistRegex);

		if (match) {
			const existingItems = match[2].trim();
			const entryJson = JSON.stringify(entry, null, 2)
				.replace(/\n/g, "\n      ");
			const newEntry = existingItems
				? `\n      ${entryJson},${match[2]}`
				: `\n      ${entryJson},${match[2]}`;
			const newPlaylist = `playlist: [${newEntry}\n    ]`;
			const updated = configContent.replace(playlistRegex, newPlaylist);

			writeFile(configPath, updated);
			result.configUpdated = true;
		}

		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Delete a music file
router.delete("/:file", (req, res) => {
	try {
		const filePath = path.join(MUSIC_DIR, req.params.file);
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
			res.json({ success: true });
		} else {
			res.status(404).json({ error: "File not found" });
		}
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

export default router;
