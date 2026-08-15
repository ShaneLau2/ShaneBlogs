import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addToPlaylist } from "../utils/music-playlist.js";

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

// Only audio files for the "audio" field and image files for "cover" are allowed.
// Browsers sometimes send application/octet-stream, so fall back to the extension.
const AUDIO_EXT = /\.(mp3|flac|wav|ogg|m4a|aac)$/i;
const AUDIO_MIME = /^audio\//;
const COVER_EXT = /\.(webp|png|jpe?g|avif)$/i;
const COVER_MIME = /^image\//;

const upload = multer({
	storage,
	limits: {
		// Audio up to ~60MB, covers up to ~5MB
		fileSize: 60 * 1024 * 1024,
		files: 2,
	},
	fileFilter: (req, file, cb) => {
		const isAudio = file.fieldname === "audio";
		const isCover = file.fieldname === "cover";
		const ext = file.originalname.match(/\.[^.]+$/)?.[0] || "";
		if (
			(isAudio && (AUDIO_MIME.test(file.mimetype) || (file.mimetype === "application/octet-stream" && AUDIO_EXT.test(ext)))) ||
			(isCover && (COVER_MIME.test(file.mimetype) || (file.mimetype === "application/octet-stream" && COVER_EXT.test(ext))))
		) {
			cb(null, true);
		} else {
			cb(new Error(`Unsupported file type for field "${file.fieldname}": ${file.mimetype || ext}`));
		}
	},
});
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
		const fileName = result.audio || "unknown.mp3";
		addToPlaylist({
			name: songName,
			artist,
			url: "/assets/music/" + fileName,
			cover: result.cover ? "/assets/music/cover/" + result.cover : "",
			lrc: "",
		});
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
