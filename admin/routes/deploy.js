import { Router } from "express";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

const router = Router();

// execFileSync runs git without a shell, so user input (e.g. commit messages)
// can never be interpreted as shell commands.
function git(args) {
	return execFileSync("git", args, {
		cwd: PROJECT_ROOT,
		encoding: "utf-8",
	});
}

router.post("/sync", (req, res) => {
	try {
		const { message } = req.body;
		const commitMsg = message || "chore: update blog content via admin panel";

		// Check for uncommitted changes
		const status = git(["status", "--porcelain"]).trim();

		if (!status) {
			return res.json({ success: true, message: "Nothing to commit. Working tree clean." });
		}

		// Stage all changes
		git(["add", "."]);

		// Commit
		git(["commit", "-m", commitMsg]);

		// Push
		git(["push"]);

		res.json({
			success: true,
			message: "Changes committed and pushed successfully.",
		});
	} catch (err) {
		res.status(500).json({
			error: `Deploy failed: ${err.stderr || err.message}`,
			stderr: err.stderr,
		});
	}
});

// Check git status
router.get("/status", (req, res) => {
	try {
		const status = git(["status", "--porcelain"]).trim();

		const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();

		const lastCommit = git([
			"log",
			"-1",
			"--pretty=format:%h - %s (%ar)",
		]).trim();

		const changes = status
			? status.split("\n").map((line) => ({
					status: line.slice(0, 2).trim(),
					file: line.slice(3),
				}))
			: [];

		res.json({ branch, lastCommit, changes, hasChanges: changes.length > 0 });
	} catch (err) {
		res.status(500).json({ error: err.stderr || err.message });
	}
});

export default router;
