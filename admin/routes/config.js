import { Router } from "express";
import { readFile, writeFile } from "../utils/file-utils.js";

const router = Router();

// Read a config file
router.get("/:name", (req, res) => {
	try {
		const { name } = req.params;
		const content = readFile(`src/config/${name}`);
		res.json({ name, content });
	} catch (err) {
		res.status(404).json({ error: "Config not found" });
	}
});

// Write a config file
router.put("/:name", (req, res) => {
	try {
		const { name } = req.params;
		const { content } = req.body;
		writeFile(`src/config/${name}`, content);
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

export default router;
