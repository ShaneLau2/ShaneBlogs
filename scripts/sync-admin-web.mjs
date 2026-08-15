/**
 * admin/web/ is the single source for the admin SPA.
 *
 * This script copies the canonical files into the two places they are served
 * from:
 *   - admin/public/  → served by the local Express admin server (port 3000)
 *   - public/admin/  → served by GitHub Pages (the online admin)
 *
 * Edit admin/web/index.html and admin/web/frontmatter.js, then run:
 *   pnpm admin:sync-web
 *
 * public/admin/config.json is deployment-specific (apiBase) and is NOT synced.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "admin/web");
const TARGETS = [path.join(ROOT, "admin/public"), path.join(ROOT, "public/admin")];
const FILES = ["index.html", "frontmatter.js"];

let copied = 0;
for (const target of TARGETS) {
	fs.mkdirSync(target, { recursive: true });
	for (const file of FILES) {
		fs.copyFileSync(path.join(WEB_DIR, file), path.join(target, file));
		copied++;
		console.log(`  → ${path.relative(ROOT, path.join(target, file))}`);
	}
}
console.log(`Synced ${copied} file(s) from admin/web/`);
