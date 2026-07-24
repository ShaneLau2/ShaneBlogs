import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

export function getProjectRoot() {
	return PROJECT_ROOT;
}

export function readFile(filePath) {
	const fullPath = path.join(PROJECT_ROOT, filePath);
	return fs.readFileSync(fullPath, "utf-8");
}

export function writeFile(filePath, content) {
	const fullPath = path.join(PROJECT_ROOT, filePath);
	fs.mkdirSync(path.dirname(fullPath), { recursive: true });
	fs.writeFileSync(fullPath, content, "utf-8");
	return fullPath;
}

export function deleteFile(filePath) {
	const fullPath = path.join(PROJECT_ROOT, filePath);
	if (fs.existsSync(fullPath)) {
		fs.unlinkSync(fullPath);
		return true;
	}
	return false;
}

export function listFiles(dirPath, extension = null) {
	const fullPath = path.join(PROJECT_ROOT, dirPath);
	if (!fs.existsSync(fullPath)) return [];
	const files = fs.readdirSync(fullPath);
	if (extension) {
		return files.filter((f) => f.endsWith(extension)).sort().reverse();
	}
	return files.sort().reverse();
}

export function parseFrontmatter(content) {
	const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) return { frontmatter: {}, body: content };

	const frontmatter = {};
	for (const line of match[1].split("\n")) {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) continue;
		const key = line.slice(0, colonIndex).trim();
		let value = line.slice(colonIndex + 1).trim();

		// Parse basic YAML-like values
		if (value === "true") value = true;
		else if (value === "false") value = false;
		else if (/^\d+$/.test(value)) value = Number.parseInt(value, 10);
		else if (
			value.startsWith('"') &&
			value.endsWith('"')
		)
			value = value.slice(1, -1);
		else if (
			value.startsWith("[") &&
			value.endsWith("]")
		) {
			value = value
				.slice(1, -1)
				.split(",")
				.map((v) => v.trim().replace(/^["']|["']$/g, ""))
				.filter(Boolean);
		}

		frontmatter[key] = value;
	}

	return { frontmatter, body: match[2].trim() };
}

export function buildFrontmatter(frontmatter, body) {
	const lines = Object.entries(frontmatter)
		.map(([key, value]) => {
			if (Array.isArray(value)) {
				if (value.length === 0) return `${key}: []`;
				return `${key}: [${value.map((v) => `"${v}"`).join(", ")}]`;
			}
			if (typeof value === "string" && /[:\s\[\]]/.test(value))
				return `${key}: "${value}"`;
			return `${key}: ${value}`;
		})
		.join("\n");

	return `---\n${lines}\n---\n\n${body}`;
}
