import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
