import { Router } from "express";
import { listFiles, readFile, writeFile, deleteFile, parseFrontmatter, buildFrontmatter } from "../utils/file-utils.js";

const router = Router();
const DYNAMIC_DIR = "src/content/dynamic";

router.get("/", (req, res) => {
	try {
		const files = listFiles(DYNAMIC_DIR, ".md");
		const dynamics = files.map((f) => {
			const content = readFile(`${DYNAMIC_DIR}/${f}`);
			const { frontmatter } = parseFrontmatter(content);
			const slug = f.replace(".md", "");
			return {
				slug,
				file: f,
				published: frontmatter.published || null,
				pinned: frontmatter.pinned || false,
			};
		});
		res.json({ dynamics });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.get("/:slug", (req, res) => {
	try {
		const content = readFile(`${DYNAMIC_DIR}/${req.params.slug}.md`);
		const { frontmatter, body } = parseFrontmatter(content);
		res.json({ slug: req.params.slug, frontmatter, body });
	} catch (err) {
		res.status(404).json({ error: "Dynamic not found" });
	}
});

router.post("/", (req, res) => {
	try {
		const { slug, content, pinned } = req.body;
		const date = new Date();
		const fileSlug =
			slug ||
			`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
		const fm = {
			published: date.toISOString(),
			pinned: pinned || false,
		};
		const mdContent = buildFrontmatter(fm, content || "");
		writeFile(`${DYNAMIC_DIR}/${fileSlug}.md`, mdContent);
		res.json({ success: true, slug: fileSlug });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.put("/:slug", (req, res) => {
	try {
		const { content, pinned } = req.body;
		const existing = readFile(`${DYNAMIC_DIR}/${req.params.slug}.md`);
		const { frontmatter } = parseFrontmatter(existing);
		const fm = { ...frontmatter, pinned: pinned ?? frontmatter.pinned };
		const mdContent = buildFrontmatter(fm, content || "");
		writeFile(`${DYNAMIC_DIR}/${req.params.slug}.md`, mdContent);
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.delete("/:slug", (req, res) => {
	try {
		const deleted = deleteFile(`${DYNAMIC_DIR}/${req.params.slug}.md`);
		if (deleted) {
			res.json({ success: true });
		} else {
			res.status(404).json({ error: "Dynamic not found" });
		}
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

export default router;
