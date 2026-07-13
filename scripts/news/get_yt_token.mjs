// One-time helper: mint a YouTube refresh token for a News channel and write it
// straight into .env.local. Zero deps (Node 18+).
//
// Usage (from devstudio/):
//   node scripts/news/get_yt_token.mjs en     # sign in as the English channel
//   node scripts/news/get_yt_token.mjs hi     # sign in as the Hindi channel
//
// Reads the channel's client id/secret (named in content/channels.json) from
// .env.local, opens Google consent, and on "Allow" saves the refresh token to
// the channel's *_YT_REFRESH_TOKEN var in .env.local.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath, URL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const ENV_PATH = path.join(ROOT, ".env.local");
const CHANNELS_PATH = path.join(ROOT, "content", "channels.json");

const channelId = process.argv[2];
if (!channelId) {
  console.error("Usage: node scripts/news/get_yt_token.mjs <channelId>  (e.g. en, hi, lore, grow)");
  process.exit(1);
}

function parseEnv(text) {
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

/** Set KEY=value in .env.local, replacing an existing (even empty) line or appending. */
function setEnvVar(key, value) {
  let text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  const re = new RegExp(`^(\\s*(?:export\\s+)?${key})\\s*=.*$`, "m");
  if (re.test(text)) text = text.replace(re, `$1=${value}`);
  else text = text.replace(/\n?$/, `\n${key}=${value}\n`);
  fs.writeFileSync(ENV_PATH, text);
}

const channels = JSON.parse(fs.readFileSync(CHANNELS_PATH, "utf8")).channels;
const channel = channels.find((c) => c.id === channelId);
if (!channel) {
  console.error(`Unknown channel "${channelId}". Known: ${channels.map((c) => c.id).join(", ")}`);
  process.exit(1);
}

const env = parseEnv(fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "");
const CLIENT_ID = env[channel.creds.clientId];
const CLIENT_SECRET = env[channel.creds.clientSecret];
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`Set ${channel.creds.clientId} and ${channel.creds.clientSecret} in .env.local first.`);
  process.exit(1);
}

const PORT = 5858;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl";
const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  }).toString();

function postForm(host, p, form) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();
    const req = https.request(
      { host, path: p, method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(data));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error");
  if (err) {
    res.end("Error: " + err);
    console.error("Consent error:", err);
    server.close();
    process.exit(1);
  }
  if (!code) {
    res.end(" ");
    return;
  }
  res.end(`Done — ${channel.label} authorized. Close this tab and return to the terminal.`);
  server.close();
  try {
    const tok = await postForm("oauth2.googleapis.com", "/token", {
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: "authorization_code",
    });
    if (tok.refresh_token) {
      setEnvVar(channel.creds.refreshToken, tok.refresh_token);
      console.log(`\n✅ Saved ${channel.creds.refreshToken} to .env.local for "${channel.label}".`);
      console.log("   Restart the dev server to pick it up, then upload from the News tab.\n");
    } else {
      console.log("\n⚠️ No refresh_token returned. Response:\n", JSON.stringify(tok, null, 2));
      console.log('Fix: set the OAuth consent screen to "In production" (Publish), then rerun.');
    }
  } catch (e) {
    console.error("Token exchange failed:", e.message);
  }
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`Minting a refresh token for "${channel.label}" (${channelId}).`);
  console.log("Opening Google consent — click Allow while signed in as THAT channel's account.");
  console.log("If it does not open, paste this URL:\n" + authUrl + "\n");
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? 'start ""' : "xdg-open";
  exec(`${cmd} "${authUrl}"`);
});
