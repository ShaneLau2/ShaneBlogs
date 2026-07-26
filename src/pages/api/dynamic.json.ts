import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	dynamicSearchText,
	dynamicSlug,
	sortDynamics,
} from "@/utils/dynamic-utils";

const DYNAMIC_DIR = "src/content/dynamic";
const markdownImagePattern = /!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g;

// 简易 frontmatter 解析器（仅支持 dynamic 条目格式）
function parseFrontmatter(content: string): {
	data: Record<string, unknown>;
	body: string;
} {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { data: {}, body: content };

	const yaml = match[1];
	const body = match[2] || "";
	const data: Record<string, unknown> = {};

	for (const line of yaml.split("\n")) {
		const kv = line.match(/^(\w+):\s*(.+)$/);
		if (kv) {
			let value: unknown = kv[2].trim();
			// 去掉可选的外层引号
			if (typeof value === "string") {
				value = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
			}
			if (value === "true") value = true;
			else if (value === "false") value = false;
			else if (kv[1] === "published") value = new Date(value as string);
			data[kv[1]] = value;
		}
	}

	return { data, body };
}

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
				published: (data.published as Date) || new Date(),
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
