import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listFiles, readFile, writeFile, parseFrontmatter, buildFrontmatter, isSafeName } from "../utils/file-utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");
const SPEC_DIR = "src/content/spec";

const router = Router();

router.get("/", (req, res) => {
	try {
		const files = listFiles(SPEC_DIR, ".md").concat(listFiles(SPEC_DIR, ".mdx"));
		const pages = files.map((f) => {
			const content = readFile(`${SPEC_DIR}/${f}`);
			const { frontmatter } = parseFrontmatter(content);
			return {
				slug: f.replace(/\.(md|mdx)$/, ""),
				file: f,
				title: frontmatter.title || f,
			};
		});
		res.json({ pages });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.get("/:slug", (req, res) => {
	try {
		const { slug } = req.params;
		if (!isSafeName(slug)) return res.status(400).json({ error: "Invalid slug" });
		let content;
		try {
			content = readFile(`${SPEC_DIR}/${slug}.md`);
		} catch {
			content = readFile(`${SPEC_DIR}/${slug}.mdx`);
		}
		const { frontmatter, body } = parseFrontmatter(content);
		res.json({ slug: req.params.slug, frontmatter, body });
	} catch (err) {
		res.status(404).json({ error: "Page not found" });
	}
});

router.put("/:slug", (req, res) => {
	try {
		const { slug } = req.params;
		if (!isSafeName(slug)) return res.status(400).json({ error: "Invalid slug" });
		const { title, body } = req.body;
		const specPath = path.join(PROJECT_ROOT, SPEC_DIR);
		const mdPath = path.join(specPath, `${slug}.md`);
		const mdxPath = path.join(specPath, `${slug}.mdx`);
		const ext = fs.existsSync(mdPath) ? ".md" : ".mdx";

		const existing = readFile(`${SPEC_DIR}/${slug}${ext}`);
		const { frontmatter } = parseFrontmatter(existing);
		const fm = { ...frontmatter, title: title || frontmatter.title };
		const content = buildFrontmatter(fm, body || "");
		writeFile(`${SPEC_DIR}/${req.params.slug}${ext}`, content);
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

export default router;
