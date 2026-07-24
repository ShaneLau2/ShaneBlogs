import crypto from "node:crypto";

const password = process.argv[2];
if (!password) {
	console.log("Usage: node hash-password.js <your-password>");
	console.log("Then set: ADMIN_PASSWORD_HASH=<hash>");
	process.exit(1);
}

const hash = crypto.createHash("sha256").update(password).digest("hex");
console.log(`\nPassword: ${password}`);
console.log(`SHA-256:  ${hash}`);
console.log(`\nRun admin with:\n  ADMIN_PASSWORD_HASH=${hash} pnpm admin\n`);
