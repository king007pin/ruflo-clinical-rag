import fs from "node:fs";
import crypto from "node:crypto";

const file = ".env.local";
let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";

function getOrGenerate(key, type = "hex") {
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (match && match[1].replace(/['"]/g, "").trim() !== "") {
    return match[1].replace(/['"]/g, "").trim();
  }
  const bytes = crypto.randomBytes(32);
  const val = type === "base64" ? bytes.toString("base64") : bytes.toString("hex");
  
  // Replace or append
  if (match) {
    content = content.replace(new RegExp(`^${key}=.*$`, "m"), `${key}="${val}"`);
  } else {
    content += `\n${key}="${val}"`;
  }
  return val;
}

getOrGenerate("APP_PASSWORD");
getOrGenerate("AUTH_SECRET");
getOrGenerate("CRON_SECRET");
getOrGenerate("JWT_SECRET");
getOrGenerate("APP_SECRET_KEY");
getOrGenerate("APP_PHI_KEK", "base64");

fs.writeFileSync(file, content, "utf8");

// W74 — .env.local holds the KEK, JWT secret, DB URL, and provider keys.
// The default process umask leaves the file group/world readable on most dev
// shells, so any other local user (or a misconfigured backup tool) can scrape
// live credentials. Tighten to owner-only after the write. fs.chmod is a
// no-op on Windows but still safe to call there.
try {
  fs.chmodSync(file, 0o600);
} catch (err) {
  console.warn(`Warning: could not chmod 0600 ${file}: ${err.message}`);
}
console.log("Secrets initialized successfully in .env.local!");
