import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postsRouter from "./routes/posts.js";
import dynamicsRouter from "./routes/dynamics.js";
import specRouter from "./routes/spec.js";
import configRouter from "./routes/config.js";
import musicRouter from "./routes/music.js";
import musicSearchRouter from "./routes/music-search.js";
import deployRouter from "./routes/deploy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.ADMIN_PORT || 3000;

// Hash comparison — no plaintext passwords in the code
function sha256(str) {
	return crypto.createHash("sha256").update(str).digest("hex");
}

// Admin password: set ADMIN_PASSWORD_HASH env var to the SHA-256 of your password
// Default hash is for "admin" — generate your own with: node -e "console.log(require('crypto').createHash('sha256').update('your-password').digest('hex'))"
const ADMIN_PASSWORD_HASH =
	process.env.ADMIN_PASSWORD_HASH || "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";

const app = express();

// All routes require auth — port 3000 is the admin panel
app.use((req, res, next) => {
	// Only skip auth for the login page and login API
	if (req.path === "/login.html" || req.path.startsWith("/api/auth")) {
		return next();
	}
	// Check auth cookie — cookie stores the hash directly
	const token = req.headers.cookie?.match(/admin_token=([^;]+)/)?.[1];
	if (token === ADMIN_PASSWORD_HASH) {
		return next();
	}
	// API routes return 401
	if (req.path.startsWith("/api")) {
		return res.status(401).json({ error: "Unauthorized" });
	}
	// Everything else redirects to login
	res.redirect("/login.html");
});

// Auth endpoint — compares SHA-256 hash
app.post("/api/auth/login", express.json(), (req, res) => {
	const { password } = req.body;
	const hash = sha256(password || "");
	if (hash === ADMIN_PASSWORD_HASH) {
		res.json({ success: true, token: ADMIN_PASSWORD_HASH });
	} else {
		res.status(401).json({ error: "Wrong password" });
	}
});

// Global JSON body parser (must come after auth since login handles its own)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Serve the admin frontend
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/api/posts", postsRouter);
app.use("/api/dynamics", dynamicsRouter);
app.use("/api/spec", specRouter);
app.use("/api/config", configRouter);
app.use("/api/music", musicRouter);
app.use("/api/music", musicSearchRouter);
app.use("/api/deploy", deployRouter);

// Serve the admin SPA for all non-API routes
app.get("*", (req, res) => {
	if (!req.path.startsWith("/api")) {
		res.sendFile(path.join(__dirname, "public", "index.html"));
	}
});

app.listen(PORT, () => {
	console.log(`\n  🚀 Firefly Admin Panel`);
	console.log(`  ─────────────────────`);
	console.log(`  Local:   http://localhost:${PORT}`);
	console.log(`  Blog:    http://localhost:4321`);
	console.log(`\n  Press Ctrl+C to stop\n`);
});
