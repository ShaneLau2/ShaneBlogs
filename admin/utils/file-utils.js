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

// Guards against path traversal: rejects separators, "..", leading dots and
// control characters. Used for slugs/names that end up in file paths.
export function isSafeName(name) {
	return (
		typeof name === "string" &&
		name.length > 0 &&
		name.length <= 200 &&
		!name.includes("/") &&
		!name.includes("\\") &&
		!name.includes("..") &&
		!name.startsWith(".") &&
		!/[\u0000-\u001f]/.test(name)
	);
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

// Frontmatter parsing/serialization lives in the shared module so the admin
// SPA, the Express server and the Astro API route all use one implementation.
import {
	parseFrontmatter as parseSharedFrontmatter,
	buildFrontmatter as buildSharedFrontmatter,
} from "../web/frontmatter.js";

// Kept as a thin wrapper so route code still receives { frontmatter, body }.
export function parseFrontmatter(content) {
	const { data, body } = parseSharedFrontmatter(content);
	return { frontmatter: data, body };
}

export function buildFrontmatter(frontmatter, body) {
	return buildSharedFrontmatter(frontmatter, body);
}
