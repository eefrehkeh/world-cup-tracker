# World Cup 2026 Tracker

A self-contained, spoiler-protected highlight tracker for the 2026 FIFA World Cup.

## Features
- By Group / By Date / By Team / Bracket views
- Spoiler-protected scores with click-to-reveal
- Progressive group standings
- Watched-match tracking, persisted server-side via Netlify Blobs (anonymous per-visitor cookie, no login)
- YouTube highlight links + embed slots
- Responsive knockout bracket (Round of 32 → Final) with real connector lines, full-width on desktop, swipeable paging on mobile

## Deployment
Static site (`index.html`) + one Netlify Function (`netlify/functions/watched-state.mts`) for persistence.

Run `npm install` once so `@netlify/blobs` and `@netlify/functions` are available for the function to import.

Deployed via Netlify. See `netlify.toml` for config.

## Roadmap
See `ROADMAP.md` for the running list of bugs, fixes, and planned features.

## Documentation
- `PROJECT_HISTORY.md` — full history of everything built in this project, from the first prototype through the current deployed version (written retroactively since most of this predates the repo's commit history).
- `PR_DESCRIPTION_blobs-persistence.md` — detailed write-up of the Netlify Blobs persistence architecture, intended to be pasted into the PR description for that change.
