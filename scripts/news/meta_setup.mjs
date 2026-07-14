// One-command Meta (Instagram + Facebook) setup for news publishing.
//
// Usage:
//   node scripts/news/meta_setup.mjs <SHORT_LIVED_USER_TOKEN> [--app APP_ID:APP_SECRET] [--page PAGE_ID] [--write]
//
// What it does, in order:
//   1. (with --app) exchanges your short-lived Graph Explorer token for a
//      long-lived user token (~60 days)
//   2. lists the Facebook Pages this token can manage (GET /me/accounts) —
//      the PAGE token it derives from a long-lived user token never expires
//   3. finds the Instagram professional account linked to the chosen Page
//   4. checks the token actually has the permissions publishing needs
//   5. with --write: saves META_ACCESS_TOKEN / META_PAGE_ID / META_IG_USER_ID
//      into .env.local (tokens are never printed to the terminal)
//
// Then restart the dev server and use "Post to Insta + FB" in the News tab.

import fs from "node:fs";
import path from "node:path";

const V = process.env.META_GRAPH_VERSION || "v21.0";
const GRAPH = `https://graph.facebook.com/${V}`;

const args = process.argv.slice(2);
const token0 = args.find((a) => !a.startsWith("--"));
const appArg = args.includes("--app") ? args[args.indexOf("--app") + 1] : null;
const pageArg = args.includes("--page") ? args[args.indexOf("--page") + 1] : null;
const write = args.includes("--write");

if (!token0) {
  console.log("Usage: node scripts/news/meta_setup.mjs <USER_TOKEN> [--app APP_ID:APP_SECRET] [--page PAGE_ID] [--write]");
  process.exit(1);
}

const mask = (t) => `${t.slice(0, 10)}… (${t.length} chars)`;

async function graph(pathname, params = {}) {
  const url = new URL(`${GRAPH}/${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`${pathname}: ${data.error?.message ?? `HTTP ${res.status}`}`);
  return data;
}

let userToken = token0;

// 1. Extend to a long-lived user token when app credentials are given.
if (appArg) {
  const [appId, appSecret] = appArg.split(":");
  if (!appId || !appSecret) {
    console.error("--app expects APP_ID:APP_SECRET (from your app's Settings → Basic)");
    process.exit(1);
  }
  const ext = await graph("oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: token0,
  });
  userToken = ext.access_token;
  console.log(`✔ exchanged for a long-lived user token ${mask(userToken)}`);
} else {
  console.log("ℹ no --app given — continuing with your token as-is (short-lived tokens die in ~1-2h;");
  console.log("  rerun with --app APP_ID:APP_SECRET for a 60-day token → its page token never expires)");
}

// 2. Permissions sanity check.
try {
  const perms = await graph("me/permissions", { access_token: userToken });
  const granted = new Set(perms.data.filter((p) => p.status === "granted").map((p) => p.permission));
  const need = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish"];
  const missing = need.filter((p) => !granted.has(p));
  if (missing.length) console.log(`⚠ token is missing permissions: ${missing.join(", ")} — regenerate in Graph Explorer with these ticked`);
  else console.log("✔ all five required permissions granted");
} catch (e) {
  console.log(`⚠ could not check permissions: ${e.message}`);
}

// 3. Resolve the Page + its page-access-token.
let page;
const pages = (await graph("me/accounts", { access_token: userToken, fields: "id,name,access_token" })).data ?? [];
if (pages.length) {
  console.log(`✔ pages found: ${pages.map((p) => `${p.name} (${p.id})`).join(", ")}`);
  page = pageArg ? pages.find((p) => p.id === pageArg) : pages[0];
  if (!page) {
    console.error(`✘ --page ${pageArg} is not among the pages above`);
    process.exit(1);
  }
  if (pages.length > 1 && !pageArg) console.log(`ℹ using the first page — pass --page <id> to pick another`);
} else if (pageArg) {
  // /me/accounts is empty (e.g. the token identity is the Page itself, not the
  // admin user). If the Page was granted as an asset, we can still fetch its
  // page-access-token directly by id.
  console.log("ℹ /me/accounts returned no pages — fetching the page token directly by --page id");
  const direct = await graph(pageArg, { access_token: userToken, fields: "id,name,access_token" });
  if (!direct.access_token) {
    console.error("✘ the page returned no access_token for this user token.");
    console.error("  In Graph API Explorer, generate the token while logged in as your PERSONAL profile");
    console.error("  (the popup should say 'Continue as <Your Name>', not 'Continue as Bharat Briefs').");
    console.error("  Switch profiles at facebook.com top-right, then regenerate and rerun.");
    process.exit(1);
  }
  page = direct;
} else {
  console.error("✘ this token manages no Facebook Pages and no --page id was given.");
  console.error("  Rerun adding: --page 1236065149586101   (your Bharat-Briefs Page id from the consent screen)");
  process.exit(1);
}
console.log(`✔ using page: ${page.name} (${page.id}), page token ${mask(page.access_token)}`);

// 4. Linked Instagram professional account.
const igInfo = await graph(page.id, { access_token: page.access_token, fields: "instagram_business_account" });
const igId = igInfo.instagram_business_account?.id;
if (!igId) {
  console.error("✘ no Instagram professional account is linked to this Page yet.");
  console.error("  Link it: Instagram app → Edit profile → Page  (or Page settings → Linked accounts → Instagram), then rerun.");
  process.exit(1);
}
const ig = await graph(igId, { access_token: page.access_token, fields: "username" });
console.log(`✔ linked Instagram: @${ig.username} (${igId})`);

// 5. Write .env.local.
if (write) {
  const envPath = path.join(process.cwd(), ".env.local");
  let lines = [];
  try {
    lines = fs.readFileSync(envPath, "utf8").split("\n");
  } catch {}
  const set = (key, value) => {
    const line = `${key}=${value}`;
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = line;
    else lines.push(line);
  };
  set("META_ACCESS_TOKEN", page.access_token);
  set("META_PAGE_ID", page.id);
  set("META_IG_USER_ID", igId);
  fs.writeFileSync(envPath, lines.join("\n").replace(/\n*$/, "\n"));
  console.log("✔ wrote META_ACCESS_TOKEN, META_PAGE_ID, META_IG_USER_ID to .env.local");
  console.log("→ restart the dev server, render a news short, then hit “Post to Insta + FB”.");
} else {
  console.log("\nDry run complete. Rerun with --write to save these into .env.local:");
  console.log(`  META_PAGE_ID=${page.id}`);
  console.log(`  META_IG_USER_ID=${igId}`);
  console.log(`  META_ACCESS_TOKEN=${mask(page.access_token)} (written only with --write)`);
}
