# Automated highlight backfill

A GitHub Actions workflow keeps `videoId` fields filled with FOX Soccer highlight IDs as
matches are played — no laptop required.

## How it works

`.github/workflows/backfill-video-ids.yml` runs every 30 minutes during match hours (14:00–06:59 UTC; paused the rest of the day, when no Americas matches are being uploaded) and:

1. `scripts/backfill_from_youtube.mjs` — reads `video_ids.json`, finds empty matches, and
   pulls the FOX Soccer (`@Foxsoccer`) **uploads playlist** via the YouTube Data API. It
   fills a match only when an upload's title contains both team names + "highlights" +
   "world cup", isn't a goal/interview/recap clip, and was published within 3 days of the
   match date. Standard "Highlights" cut is preferred over Extended/Fast.
2. `scripts/apply_video_ids.py` — writes the IDs into `index.html`.
3. The job commits and pushes to the default branch, which triggers the Netlify deploy.

It's idempotent: runs with nothing new do nothing. It polls for *"has FOX posted the
highlight yet,"* so it needs no game schedule and lands within ~30 min of the upload.

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
- Quota: ~7 API units per run (playlist reads), far under the 10,000/day default.
- Matching lives in `backfill_from_youtube.mjs` (`ALIASES`, `EXCLUDE`, date window) — tune
  there if a title format or team-name variant is missed.
