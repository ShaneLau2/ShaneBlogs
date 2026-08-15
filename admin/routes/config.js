import { Router } from "express";
import { readFile, writeFile, isSafeName } from "../utils/file-utils.js";

const router = Router();

// Only plain config files inside src/config are allowed — blocks path
// traversal via names like "../../.git/config".
const CONFIG_NAME_PATTERN = /^[A-Za-z0-9_-]+\.(ts|html|md)$/;

function isValidConfigName(name) {
	return isSafeName(name) && CONFIG_NAME_PATTERN.test(name);
}

// Read a config file
router.get("/:name", (req, res) => {
	try {
		const { name } = req.params;
		if (!isValidConfigName(name)) {
			return res.status(400).json({ error: "Invalid config name" });
		}
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
		if (!isValidConfigName(name)) {
			return res.status(400).json({ error: "Invalid config name" });
		}
		const { content } = req.body;
		writeFile(`src/config/${name}`, content);
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

export default router;
