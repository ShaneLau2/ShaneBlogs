import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../../../admin/web/frontmatter.js";
import {
	dynamicSearchText,
	dynamicSlug,
	sortDynamics,
} from "@/utils/dynamic-utils";

const DYNAMIC_DIR = "src/content/dynamic";
const markdownImagePattern = /!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g;

function loadDynamics() {
	const dir = join(
		fileURLToPath(import.meta.url),
		"..",
		"..",
		"..",
		"..",
		DYNAMIC_DIR,
	);
	const files = readdirSync(dir).filter(
		(f) => f.endsWith(".md") && f !== ".gitkeep",
	);

	return files.map((file) => {
		const content = readFileSync(join(dir, file), "utf-8");
		const { data, body } = parseFrontmatter(content);
		return {
			id: file,
			body,
			data: {
				published: data.published
					? new Date(data.published as string)
					: new Date(),
				pinned: (data.pinned as boolean) || false,
			},
		};
	});
}

export async function GET() {
	const processor = await createMarkdownProcessor();
	const dynamics = sortDynamics(loadDynamics());
	const data = await Promise.all(
		dynamics.map(async (entry) => {
			const images: Array<{ alt: string; src: string; title?: string }> = [];
			const markdown = (entry.body || "").replace(
				markdownImagePattern,
				(_match, alt: string, src: string, title?: string) => {
					images.push({ alt, src, ...(title ? { title } : {}) });
					return "";
				},
			);
			const rendered = await processor.render(markdown);

			return {
				id: dynamicSlug(entry.id),
				published: entry.data.published.getTime(),
				html: rendered.code,
				images,
				searchText: dynamicSearchText(entry),
				pinned: entry.data.pinned || false,
			};
		}),
	);

	return new Response(JSON.stringify(data), {
		headers: {
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}
