#!/usr/bin/env node
// Generate SHA-256 hash for the online admin password
// Usage: node admin/set-password.js <your-password>
// Then copy the hash into public/admin/config.json

const crypto = await import("node:crypto");
const password = process.argv[2];
if (!password) {
  console.log("Usage: node admin/set-password.js <your-password>");
  process.exit(1);
}

const hash = crypto.createHash("sha256").update(password).digest("hex");
console.log("\nYour password:  " + password);
console.log("SHA-256 hash:  " + hash);
console.log("\nUpdate public/admin/config.json:");
console.log('  "passwordHash": "' + hash + '"');
