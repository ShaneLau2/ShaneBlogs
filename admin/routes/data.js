import { Router } from "express";
import { readFile, writeFile, isSafeName } from "../utils/file-utils.js";

const router = Router();

// Only simple JSON data files inside src/data are allowed.
const DATA_NAME_PATTERN = /^[A-Za-z0-9_-]+\.json$/;

function isValidDataName(name) {
	return isSafeName(name) && DATA_NAME_PATTERN.test(name);
}

// Read a data file
router.get("/:name", (req, res) => {
	try {
		const { name } = req.params;
		if (!isValidDataName(name)) {
			return res.status(400).json({ error: "Invalid data file name" });
		}
		const content = readFile(`src/data/${name}`);
		res.setHeader("Content-Type", "application/json");
		res.send(content);
	} catch (err) {
		res.status(404).json({ error: "Data file not found" });
	}
});

// Write a data file (validated as JSON before saving)
router.put("/:name", (req, res) => {
	try {
		const { name } = req.params;
		if (!isValidDataName(name)) {
			return res.status(400).json({ error: "Invalid data file name" });
		}
		const { content } = req.body;
		// Reject non-JSON content to protect the file from corruption
		JSON.parse(content);
		writeFile(`src/data/${name}`, content);
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

export default router;
