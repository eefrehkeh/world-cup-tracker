# Automated highlight backfill

A GitHub Actions workflow keeps `videoId` fields filled with FOX Soccer highlight IDs as
matches are played — no laptop required.

## How it works

`.github/workflows/backfill-video-ids.yml` runs every 30 minutes during match hours (15:00–05:59 UTC; paused otherwise, when no Americas matches are being uploaded). It fails fast if the `YT_API_KEY` secret is missing, and writes a per-run summary (new IDs found / how many still empty) to the Actions run page. Each run:

1. `scripts/backfill_from_youtube.mjs` — reads `video_ids.json`, finds empty matches, and
   pulls the FOX Soccer (`@Foxsoccer`) **uploads playlist** via the YouTube Data API. It
   fills a match only when an upload's title contains both team names + "highlights" +
   "world cup", isn't a goal/interview/recap clip, and was published within 3 days of the
   match date. Standard "Highlights" cut is preferred over Extended/Fast. It pages back only
   as far as the oldest still-empty match (minus the 3-day window), so a highlight posted a
   few days late is still found — not just the most recent uploads.
2. `scripts/apply_video_ids.py` — writes the IDs into `index.html`.
3. The job commits and pushes to the default branch, which triggers the Netlify deploy.

It's idempotent: runs with nothing new do nothing. It polls for *"has FOX posted the
highlight yet,"* so it needs no game schedule and lands within ~30 min of the upload.

## Group stage and knockouts

Both the group-stage cards (the `DATA` array) and the **Knockouts** cards (the `KNOCKOUTS`
array) share this pipeline: every match is keyed `Home|Away|Date` in `video_ids.json`, and
`apply_video_ids.py` writes the id into whichever array holds that match.

To add a new knockout round: add each match to the `KNOCKOUTS` array in `index.html` (teams,
date, and — once played — score + note) with `videoId:""`, and add the same `Home|Away|Date`
key to `video_ids.json` with an empty id. The Action then fills the **video id** automatically
within ~30 min of FOX posting the highlight. **Scores and notes are not automated** — update
those by hand when the game is played.

## One-time setup

1. **Create a YouTube Data API key** — in Google Cloud Console: create a project, enable
   **YouTube Data API v3**, create an **API key** (optionally restrict it to that API).
2. **Add it as a repo secret** — repo **Settings → Secrets and variables → Actions → New
   repository secret**, name it `YT_API_KEY`, paste the key.
3. **Merge this workflow to the default branch (`main`).** Scheduled workflows only run
   from the default branch.

## Use it / tune it

- Run on demand: **Actions → Backfill FOX highlight video IDs → Run workflow**.
- Change cadence: edit the `cron` line (e.g. `*/15 * * * *` for 15 min). Cron is UTC.
- Quota: 1 unit per upload page; it pages back only far enough to cover the oldest
  still-empty match (a handful of units typically, capped at 40 pages), far under the
  10,000/day default.
- Matching lives in `backfill_from_youtube.mjs` (`ALIASES`, `EXCLUDE`, date window) — tune
  there if a title format or team-name variant is missed.
