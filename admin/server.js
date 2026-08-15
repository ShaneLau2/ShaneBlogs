import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postsRouter from "./routes/posts.js";
import dynamicsRouter from "./routes/dynamics.js";
import specRouter from "./routes/spec.js";
import configRouter from "./routes/config.js";
import dataRouter from "./routes/data.js";
import musicRouter from "./routes/music.js";
import musicSearchRouter from "./routes/music-search.js";
import musicPlaywrightRouter from "./routes/music-playwright.js";
import deployRouter from "./routes/deploy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.ADMIN_PORT || 3000;
// Bind to loopback by default — the admin panel must not be reachable from the LAN.
// Override with ADMIN_HOST=0.0.0.0 if you really need remote access.
const HOST = process.env.ADMIN_HOST || "127.0.0.1";

// Hash comparison — no plaintext passwords in the code
function sha256(str) {
	return crypto.createHash("sha256").update(str).digest("hex");
}

// Admin password: reads hash from public/admin/config.json (shared with online admin)
// Override with ADMIN_PASSWORD_HASH env var for extra security
function loadPasswordHash() {
	try {
		const configPath = path.resolve(__dirname, "../public/admin/config.json");
		const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
		if (config.passwordHash) return config.passwordHash;
	} catch {}
	throw new Error(
		"No admin password hash configured. Set ADMIN_PASSWORD_HASH=<sha256> " +
			"or put a passwordHash in public/admin/config.json " +
			"(generate one with `pnpm admin:set-pwd`).",
	);
}
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || loadPasswordHash();

// Simple in-memory rate limiter for the login endpoint (per IP, 5 tries / 10 min)
const loginAttempts = new Map();
function rateLimited(ip) {
	const now = Date.now();
	const windowMs = 10 * 60 * 1000;
	const entry = loginAttempts.get(ip);
	if (!entry || now - entry.resetAt > windowMs) {
		loginAttempts.set(ip, { count: 1, resetAt: now + windowMs });
		return false;
	}
	entry.count++;
	// Opportunistic cleanup to avoid unbounded growth
	if (loginAttempts.size > 10_000) {
		for (const [k, v] of loginAttempts) {
			if (now - v.resetAt > windowMs) loginAttempts.delete(k);
		}
	}
	return entry.count > 5;
}

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

// Auth endpoint — compares SHA-256 hash, sets an HttpOnly cookie server-side
app.post("/api/auth/login", express.json(), (req, res) => {
	if (rateLimited(req.ip || req.socket.remoteAddress || "unknown")) {
		return res.status(429).json({ error: "Too many attempts, try again later" });
	}
	const { password } = req.body;
	const hash = sha256(password || "");
	if (hash === ADMIN_PASSWORD_HASH) {
		// Constant-time comparison is not needed here (hash is public), but the
		// cookie keeps the token out of client-side JS.
		const secure = req.secure || req.get("x-forwarded-proto") === "https";
		res.setHeader(
			"Set-Cookie",
			`admin_token=${ADMIN_PASSWORD_HASH}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${secure ? "; Secure" : ""}`,
		);
		res.json({ success: true });
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
app.use("/api/data", dataRouter);
app.use("/api/music", musicRouter);
app.use("/api/music", musicSearchRouter);
app.use("/api/music", musicPlaywrightRouter);
app.use("/api/deploy", deployRouter);

// Serve the admin SPA for all non-API routes; unknown API paths get a 404
app.get("*", (req, res) => {
	if (req.path.startsWith("/api")) {
		return res.status(404).json({ error: "Not found" });
	}
	res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, HOST, () => {
	console.log(`\n  🚀 Firefly Admin Panel`);
	console.log(`  ─────────────────────`);
	console.log(`  Local:   http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
	console.log(`  Blog:    http://localhost:4321`);
	console.log(`\n  Press Ctrl+C to stop\n`);
});
