// Read-only check: for each channel in content/channels.json, confirm its
// .env.local credentials authorize a real YouTube channel (validates the
// refresh token and shows which channel it posts to). No upload, ~1 quota unit.
//   node scripts/news/whoami.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { channels } = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "channels.json"), "utf8"));

for (const ch of channels) {
  const id = env[ch.creds.clientId];
  const secret = env[ch.creds.clientSecret];
  const refresh = env[ch.creds.refreshToken];
  if (!id || !secret || !refresh) {
    console.log(`• ${ch.label} (${ch.id}): missing credentials`);
    continue;
  }
  const auth = new google.auth.OAuth2(id, secret);
  auth.setCredentials({ refresh_token: refresh });
  try {
    const r = await google.youtube({ version: "v3", auth }).channels.list({ part: ["snippet"], mine: true });
    const c = r.data.items?.[0];
    console.log(`• ${ch.label} (${ch.id}) → authorizes "${c?.snippet?.title}" (${c?.id}) ✓`);
  } catch (e) {
    console.log(`• ${ch.label} (${ch.id}) → FAILED: ${String(e?.message || e).slice(0, 160)}`);
  }
}
