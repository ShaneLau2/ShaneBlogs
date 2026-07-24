import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postsRouter from "./routes/posts.js";
import dynamicsRouter from "./routes/dynamics.js";
import specRouter from "./routes/spec.js";
import configRouter from "./routes/config.js";
import musicRouter from "./routes/music.js";
import deployRouter from "./routes/deploy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.ADMIN_PORT || 3000;

const app = express();

// Middleware
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
