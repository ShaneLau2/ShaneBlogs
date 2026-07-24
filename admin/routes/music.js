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
		// Sanitize filename: keep Chinese characters, remove special chars
		const name = file.originalname.replace(/\.[^.]+$/, "");
		const ext = file.originalname.match(/\.[^.]+$/)?.[0] || "";
		// Keep Unicode letters, spaces, hyphens, parentheses; remove the rest
		const safe = name.replace(/[^\p{L}\p{N}\s\-()]/gu, "").replace(/\s+/g, " ").trim().slice(0, 80);
		cb(null, safe + ext);
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
		if (req.files?.audio) result.audio = req.files.audio[0].filename;
		if (req.files?.cover) result.cover = req.files.cover[0].filename;
		res.json({ success: true, ...result });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Upload music + auto-add to config playlist
router.post("/upload-and-add", upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]), (req, res) => {
	try {
		const result = {};
		if (req.files?.audio) result.audio = req.files.audio[0].filename;
		if (req.files?.cover) result.cover = req.files.cover[0].filename;

		const songName = req.body.name || result.audio?.replace(/\.[^.]+$/, "") || "Unknown";
		const artist = req.body.artist || "Unknown";

		// Build playlist entry — multer already sanitized the filename
		const esc = (s) => JSON.stringify(s || "");
		const fileName = result.audio || "unknown.mp3";
		const entryLines = [
			"\t\t\t{",
			"\t\t\t\tname: " + esc(songName) + ",",
			"\t\t\t\tartist: " + esc(artist) + ",",
			"\t\t\t\turl: " + esc("/assets/music/" + fileName) + ",",
			"\t\t\t\tcover: " + esc(result.cover ? "/assets/music/cover/" + result.cover : "") + ",",
			"\t\t\t\tlrc: \"\",",
			"\t\t\t}",
		].join("\n");

		// Read current config and extract existing entries
		const configPath = "src/config/musicConfig.ts";
		const configContent = readFile(configPath);

		// Extract entries between playlist: [...] — track brace depth to handle [Official Video] inside strings
		let existingRaw = "";
		const ps = configContent.indexOf("playlist: [");
		if (ps !== -1) {
			let braceDepth = 0;
			let bracketDepth = 0;
			let endPos = -1;
			const inner = configContent.slice(ps + "playlist: [".length);
			for (let i = 0; i < inner.length; i++) {
				const ch = inner[i];
				if (ch === "{") braceDepth++;
				if (ch === "}") braceDepth--;
				if (ch === "[") bracketDepth++;
				if (ch === "]") {
					if (braceDepth === 0 && bracketDepth === 0) {
						endPos = i;
						break;
					}
					bracketDepth--;
				}
			}
			if (endPos !== -1) {
				existingRaw = inner.slice(0, endPos).trim();
			}
		}
		// Rebuild full config from template
		const hasExisting = existingRaw.length > 0;
		const allEntries = hasExisting
			? `${entryLines},\n${existingRaw}`
			: `${entryLines}`;

		const header = configContent.slice(0, configContent.indexOf("local:"));
		const newConfig = `${header}\tlocal: {\n\t\tplaylist: [\n${allEntries}\n\t\t],\n\t},\n};`;

		writeFile(configPath, newConfig);
		result.configUpdated = true;

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
