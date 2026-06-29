// Fills empty videoIds in video_ids.json from the FOX Soccer YouTube uploads playlist,
// using the YouTube Data API. apply_video_ids.py then writes the IDs into index.html.
//
// Why the uploads playlist instead of search.list: playlistItems.list costs 1 quota unit
// per page (50 items) vs 100 units per search.list call, so frequent polling stays well
// under the default 10,000-units/day quota.
//
// Env:
//   YT_API_KEY  (required to run main) — YouTube Data API v3 key
//   FOX_HANDLE  (optional) — channel handle, default "Foxsoccer"
//
// A match is only filled when a FOX Soccer upload's title contains BOTH team names,
// "highlights", and "world cup", is not a goal/interview/recap clip, and was published
// within a few days of the match date (guards against same-pairing rematches).
//
// Pure matching helpers are exported for the test in backfill_from_youtube.test.mjs.

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

const API = "https://www.googleapis.com/youtube/v3";
const YEAR = 2026;
export const DATE_WINDOW_DAYS = 3;

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
export function matchDate(dateStr) {
  const m = dateStr.trim().toLowerCase().match(/([a-z]{3})\s+(\d{1,2})/);
  if (!m) return null;
  return new Date(Date.UTC(YEAR, MONTHS[m[1]] ?? 0, parseInt(m[2], 10)));
}

// Date the uploads scan must page back to: the earliest still-empty match,
// minus the match window. null when no key carries a parseable date.
export function backfillSinceDate(emptyKeys, windowDays = DATE_WINDOW_DAYS) {
  const times = emptyKeys
    .map((k) => matchDate(String(k).split("|")[2] || ""))
    .filter(Boolean)
    .map((d) => d.getTime());
  if (!times.length) return null;
  return new Date(Math.min(...times) - windowDays * 86400000);
}

export function norm(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

const ALIASES = {
  "dr congo": ["dr congo", "congo dr", "democratic republic of congo"],
  "turkiye": ["turkiye", "turkey"],
  "ivory coast": ["ivory coast", "cote d ivoire"],
  "cape verde": ["cape verde", "cabo verde"],
  "united states": ["united states", "usa"],
  "south korea": ["south korea", "korea republic"],
};
export function variants(team) { const n = norm(team); return ALIASES[n] || [n]; }
export function titleHasTeam(normTitle, team) {
  return variants(team).some((v) => new RegExp(`(^|[^a-z0-9])${v.replace(/ /g, "[ ]")}([^a-z0-9]|$)`).test(normTitle));
}

const EXCLUDE = ["best moments", "catch up", "prediction", "preview", "reaction", "scores", "goal ", "alt cast", "game in 30", "every angle", "keys to the match", "how to watch", "screamer", "live |", "full match"];
export function isMatchHighlight(title) {
  const t = norm(title);
  if (!t.includes("highlights") || !t.includes("world cup")) return false;
  return !EXCLUDE.some((b) => t.includes(b));
}
export function cutRank(title) {
  const t = norm(title);
  if (/\bextended highlights\b/.test(t)) return 2;
  if (/\b(fast|quick) highlights\b/.test(t)) return 3;
  return 1;
}

// Pick the best upload (or null) for a match key against a list of {title,id,published}.
export function pickForMatch(key, uploads) {
  const [home, away, dateStr] = key.split("|");
  const md = matchDate(dateStr);
  const cands = uploads.filter((u) => {
    if (!isMatchHighlight(u.title)) return false;
    const t = norm(u.title);
    if (!titleHasTeam(t, home) || !titleHasTeam(t, away)) return false;
    if (md && u.published) {
      if (Math.abs(new Date(u.published) - md) / 86400000 > DATE_WINDOW_DAYS) return false;
    }
    return true;
  });
  if (!cands.length) return null;
  cands.sort((a, b) => cutRank(a.title) - cutRank(b.title));
  return cands[0];
}

async function api(endpoint, params, key) {
  const url = new URL(`${API}/${endpoint}`);
  Object.entries({ ...params, key }).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${endpoint} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function uploadsPlaylistId(key, handle) {
  const j = await api("channels", { part: "contentDetails,snippet", forHandle: handle }, key);
  if (!j.items || !j.items.length) throw new Error(`No channel for handle "${handle}"`);
  console.log(`Channel: ${j.items[0].snippet.title} (${j.items[0].id})`);
  return j.items[0].contentDetails.relatedPlaylists.uploads;
}

// Pages the uploads playlist newest-first. Stops once a page's oldest upload is
// older than stopBefore (older pages can't hold a still-needed highlight), or at
// maxPages as a quota safety cap. stopBefore=null scans up to maxPages.
async function recentUploads(playlistId, key, { stopBefore = null, maxPages = 40 } = {}) {
  const items = [];
  let pageToken = "";
  for (let i = 0; i < maxPages; i++) {
    const j = await api("playlistItems", {
      part: "snippet,contentDetails", playlistId, maxResults: "50", ...(pageToken ? { pageToken } : {}),
    }, key);
    let oldestOnPage = null;
    for (const it of j.items || []) {
      const published = it.contentDetails.videoPublishedAt;
      items.push({ title: it.snippet.title, id: it.contentDetails.videoId, published });
      const t = published ? new Date(published).getTime() : null;
      if (t !== null && (oldestOnPage === null || t < oldestOnPage)) oldestOnPage = t;
    }
    if (!j.nextPageToken) break;
    if (stopBefore && oldestOnPage !== null && oldestOnPage < stopBefore.getTime()) break;
    pageToken = j.nextPageToken;
  }
  return items;
}

export async function main() {
  const key = process.env.YT_API_KEY;
  const handle = process.env.FOX_HANDLE || "Foxsoccer";
  if (!key) { console.error("Missing YT_API_KEY"); process.exit(1); }

  const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const JSON_PATH = path.join(ROOT, "video_ids.json");
  const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const empties = Object.entries(data).filter(([k, v]) => !k.startsWith("_") && !v.id);
  if (!empties.length) { console.log("No empty matches; nothing to do."); return; }

  const sinceDate = backfillSinceDate(empties.map(([k]) => k));
  const uploads = await recentUploads(await uploadsPlaylistId(key, handle), key, { stopBefore: sinceDate });
  console.log(`Fetched ${uploads.length} uploads${sinceDate ? ` (back to ${sinceDate.toISOString().slice(0, 10)})` : ""}; ${empties.length} empty matches to fill.`);

  let added = 0;
  for (const [k] of empties) {
    const pick = pickForMatch(k, uploads);
    if (!pick) continue;
    data[k] = { id: pick.id, confidence: "verified", src: `FOX Soccer YouTube auto-match: '${pick.title}'` };
    console.log(`FILLED ${k} -> ${pick.id} | ${pick.title}`);
    added++;
  }

  if (added) {
    fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + "\n");
    console.log(`Wrote ${added} new ID(s) to video_ids.json`);
  } else {
    console.log("No new FOX uploads matched the empty matches this run.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
