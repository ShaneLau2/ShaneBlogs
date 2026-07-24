import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { listFiles, readFile, writeFile, deleteFile, parseFrontmatter, buildFrontmatter, getProjectRoot } from "../utils/file-utils.js";

const router = Router();
const POSTS_DIR = "src/content/posts";

// List all posts
router.get("/", (req, res) => {
	try {
		const files = listFiles(POSTS_DIR, ".md").concat(listFiles(POSTS_DIR, ".mdx"));
		const posts = files.map((f) => {
			const content = readFile(`${POSTS_DIR}/${f}`);
			const { frontmatter } = parseFrontmatter(content);
			return {
				slug: f.replace(/\.(md|mdx)$/, ""),
				file: f,
				title: frontmatter.title || f,
				published: frontmatter.published || null,
				tags: frontmatter.tags || [],
				category: frontmatter.category || "",
				draft: frontmatter.draft || false,
				pinned: frontmatter.pinned || false,
			};
		});
		res.json({ posts });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Get a single post
router.get("/:slug", (req, res) => {
	try {
		const { slug } = req.params;
		let content;
		try {
			content = readFile(`${POSTS_DIR}/${slug}.md`);
		} catch {
			content = readFile(`${POSTS_DIR}/${slug}.mdx`);
		}
		const { frontmatter, body } = parseFrontmatter(content);
		res.json({ slug, frontmatter, body });
	} catch (err) {
		res.status(404).json({ error: "Post not found" });
	}
});

// Create a new post
router.post("/", (req, res) => {
	try {
		const { slug, frontmatter, body } = req.body;
		if (!slug) return res.status(400).json({ error: "slug is required" });

		const fm = {
			title: frontmatter?.title || slug,
			published: frontmatter?.published || new Date().toISOString().split("T")[0],
			description: frontmatter?.description || "",
			tags: frontmatter?.tags || [],
			category: frontmatter?.category || "",
			draft: frontmatter?.draft ?? true,
			...frontmatter,
		};

		const content = buildFrontmatter(fm, body || "");
		const ext = frontmatter?.isMdx ? ".mdx" : ".md";
		writeFile(`${POSTS_DIR}/${slug}${ext}`, content);
		res.json({ success: true, slug, file: `${slug}${ext}` });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Update a post
router.put("/:slug", (req, res) => {
	try {
		const { slug } = req.params;
		const { frontmatter, body } = req.body;
		const root = getProjectRoot();
		const ext = fs.existsSync(path.join(root, POSTS_DIR, `${slug}.md`)) ? ".md" : ".mdx";
		const content = buildFrontmatter(frontmatter, body || "");
		writeFile(`${POSTS_DIR}/${slug}${ext}`, content);
		res.json({ success: true });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

// Delete a post
router.delete("/:slug", (req, res) => {
	try {
		const { slug } = req.params;
		const deleted = deleteFile(`${POSTS_DIR}/${slug}.md`) || deleteFile(`${POSTS_DIR}/${slug}.mdx`);
		if (deleted) {
			res.json({ success: true });
		} else {
			res.status(404).json({ error: "Post not found" });
		}
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

export default router;
