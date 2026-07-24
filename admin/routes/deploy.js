import { Router } from "express";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

const router = Router();

router.post("/sync", (req, res) => {
	try {
		const { message } = req.body;
		const commitMsg = message || "chore: update blog content via admin panel";

		// Check for uncommitted changes
		const status = execSync("git status --porcelain", {
			cwd: PROJECT_ROOT,
			encoding: "utf-8",
		}).trim();

		if (!status) {
			return res.json({ success: true, message: "Nothing to commit. Working tree clean." });
		}

		// Stage all changes
		execSync("git add .", { cwd: PROJECT_ROOT, encoding: "utf-8" });

		// Commit
		execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, {
			cwd: PROJECT_ROOT,
			encoding: "utf-8",
		});

		// Push
		execSync("git push", { cwd: PROJECT_ROOT, encoding: "utf-8" });

		res.json({
			success: true,
			message: "Changes committed and pushed successfully.",
		});
	} catch (err) {
		res.status(500).json({
			error: `Deploy failed: ${err.message}`,
			stderr: err.stderr,
		});
	}
});

// Check git status
router.get("/status", (req, res) => {
	try {
		const status = execSync("git status --porcelain", {
			cwd: PROJECT_ROOT,
			encoding: "utf-8",
		}).trim();

		const branch = execSync("git rev-parse --abbrev-ref HEAD", {
			cwd: PROJECT_ROOT,
			encoding: "utf-8",
		}).trim();

		const lastCommit = execSync('git log -1 --pretty=format:"%h - %s (%ar)"', {
			cwd: PROJECT_ROOT,
			encoding: "utf-8",
		}).trim();

		const changes = status
			? status.split("\n").map((line) => ({
					status: line.slice(0, 2).trim(),
					file: line.slice(3),
				}))
			: [];

		res.json({ branch, lastCommit, changes, hasChanges: changes.length > 0 });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

export default router;
