# Project History

This document covers everything built in this project from the very first request through the current deployed version, since none of it has corresponding commit history (the app was built iteratively in conversation with Claude before this repo existed). Organized roughly chronologically, by feature area.

---

## Origins

The project started as a one-off factual question — "How many games have been played in the World Cup so far?" — on June 21, 2026. That turned into "build me a tracker," modeled explicitly on a prior NBA Playoffs highlight tracker (same creator, different sport): spoiler-protected scores, organized by group, with short/long highlight links pointing at specific YouTube channels rather than hardcoded video links (to avoid link rot).

The whole thing has always been a **single self-contained HTML file** — inline CSS and JavaScript, no build tooling, no framework. That stayed true even after the Netlify Functions backend was added; the front end is still one file.

## Visual identity

Before writing any code, the design direction was deliberately chosen to avoid a generic "sports app" look: a **ticket-stub / match-passport aesthetic**. Palette: warm paper cream (`#f6f1e4`), pitch green (`#1e5631`), gold (`#d9a52c`), rust/terracotta (`#b94e2c`), dark ink (`#1b2a1f`). Typography: Bebas Neue for headers, Archivo for body text, JetBrains Mono for labels/metadata — chosen to feel like a printed program or boarding pass rather than a dashboard.

## Group stage data

All 12 groups (A–L) and 48 teams were sourced from FIFA's official draw and cross-checked against multiple outlets before building. The match data model: each group has a `teams` array and a `matches` array, where each match has `home`, `away`, `date`, `score` (or `—` if unplayed), `note` (a short editorial line about what happened), `venue`, and `city`.

Score accuracy was treated as important throughout — several scores were caught and corrected after the user spotted mistakes (e.g., France vs. Senegal was actually 3–1, not 2–0 as first entered). The standing instruction became: flag uncertainty rather than confidently assert a result, and re-verify via search before adding any new score.

## Core features, in the order they were built

### 1. Spoiler protection
Every match score is hidden behind a "Reveal Final Score" button by default. There's also a global "Reveal All Scores" toggle. This was the first and most non-negotiable requirement of the whole project — nothing about results should be visible without an explicit action.

### 2. By Group / By Date views
- **By Group**: matches grouped under each of the 12 groups, in their natural group order.
- **By Date**: the same matches flattened and re-sorted chronologically across all groups, with day-section headers (JUN 11, JUN 12, etc.).

### 3. Progressive standings tables
Both views show a group's standings table *as they stood after that specific match* — i.e., the table under the Jun 13 Brazil–Morocco card reflects the group's record through Jun 13, not the final table. This required two parallel implementations early on (one keyed by date-cutoff for the Date view, one keyed by array-position for the Group view) before being unified under a single `computeStandingsFromMatches()` helper that both views call with the right slice of matches. Top-two rows are tinted green to indicate automatic qualification.

**Bug history**: standings were originally only wired up for the Date view — Group view was calling `renderMatchCard()` with `null` for the standings argument. This was caught and fixed by passing each match's own position within its group's match array as the cutoff point.

### 4. Watched-match tracking
A checkbox on every match card ("I've watched this match"), with a running counter in the page header ("You've Watched: N"). Uses **stable, content-based match keys** (`wc26-{group}-{home}-{away}-{date}`) rather than render-order indices — this was a deliberate decision to prevent state from getting scrambled when the same match appears in multiple views (Group, Date, Team) or when the data array gets reordered.

### 5. By Team (country) view
A chip for every one of the 48 teams; clicking one filters down to just that team's matches, chronologically, with the same standings/video/watched behavior as everywhere else.

### 6. YouTube highlight links
Each match has a "Short recap (<6 min)" and "Extended highlights (10+ min)" link, built as YouTube *search* URLs (not hardcoded video links) targeting specific channels — Supersport, FIFA, ESPN FC, Fox Sports, and Fox Soccer, rotated across matches. This avoids link rot since we don't have to guess a specific video ID for every one of 100+ matches.

### 7. Embedded video player (per match)
Each match also got a `videoId` field and, when filled in, a real embedded YouTube `<iframe>` inside the spoiler-gated reveal area (same hidden-until-revealed behavior as the standings). Left empty by default with a "no video linked yet" placeholder, since real Fox Soccer video IDs aren't something Claude can reliably look up and verify — the field is there for the user to fill in by hand as they find real clips.

**Known issue, investigated at length**: embedding hit two separate failure modes depending on context:
- Inside Claude's artifact preview: a generic "content is blocked" message — this is Claude's artifact sandbox blocking outbound iframe/video network requests at the platform level, not a code bug.
- In a downloaded HTML file opened directly in a browser: **YouTube Error 153** ("Video Player Configuration Error"), which happens when YouTube can't get a referrer header it trusts from the embedding context. Tried: `youtube-nocookie.com` domain, removing/adding `referrerpolicy`, exact official embed code from YouTube. None fully resolved it from a downloaded static file. A "▶ watch on YouTube" fallback link was added next to every embed so the feature degrades gracefully either way.
- This is expected to behave normally now that the site is deployed to a real domain on Netlify, since a real top-level page has a legitimate referrer to send — flagged in the roadmap to re-verify post-deploy.

### 8. Knockout bracket view
Built in stages:
1. First version: round-by-round swipeable cards (Round of 32 → Final), not visually resembling a real bracket.
2. **User feedback, with a reference screenshot of an NCAA-style bracket**: rebuilt as an actual horizontal bracket *tree* — five columns (R32 → R16 → QF → SF → Final) with later rounds' matches vertically centered between the two matches feeding into them, connected by drawn elbow lines, using flexbox (`justify-content:space-around` per column, each match in a `flex:1` slot) so the geometry holds at any column height.
3. **Connector-line bug**: lines appeared to overlap/triple up, especially as columns got narrower. Root cause: the original CSS had two separate overlapping horizontal stubs (one leaving each match, one entering the next) plus a vertical line, with hardcoded pixel offsets that didn't track the actual column gap. Rebuilt so every connector piece's width is tied to the column's own padding (`--bk-gap`, 6px) rather than a magic number, guaranteeing the horizontal-vertical-horizontal elbow always meets cleanly regardless of how wide the columns render.
4. **Spacing bug**: matches were rendering too close together vertically, especially in the narrow/mobile paged view. Fixed by adding explicit padding to each match "slot" rather than relying entirely on flex distribution.
5. **Responsiveness, three breakpoints**:
   - **≥1100px (wide desktop)**: all five columns stretch via `flex:1 1 0` to fill the full available width edge-to-edge, no internal scrollbar.
   - **720–1100px (medium)**: horizontal-scroll tree — all columns at a fixed width, scroll to see more.
   - **<720px (mobile)**: converts to a swipeable **pager** — one round per screen, swipe left/right (or tap a round tab, or tap a position dot) to move between rounds. Connector lines are hidden in this mode since there's no adjacent column to connect to.
   - A `resize` listener re-applies the correct mode live if the window crosses a breakpoint.
6. **Full-bleed layout on wide screens**: the bracket section breaks out of the site's normal ~900px content column and stretches to use most of the browser window's width on desktop, via a `body.bracket-view-active` class that's toggled only while the Bracket view is active — everything else (intro text, round tabs, the "teams confirmed" strip, the date-view list below the bracket) stays at the normal readable width; only the bracket tree itself goes wide.
7. **Bracket data**: Round of 32 pairings sourced from FIFA's official knockout draw structure, including which group's winner/runner-up/third-place slot feeds each fixture. Where a team is already mathematically confirmed into the bracket, it renders in solid green; undetermined slots (e.g., "3rd place (C/D/F/G/H)") render as italic grey placeholders. Later rounds (R16 onward) show "Winner M{n}" since those literally can't be known yet. A separate block shows the third-place playoff, since it sits outside the main single-elimination tree.

### 9. Watched-list backup (export/import codes)
Before real server-side storage existed, watched state lived only in memory for that browser tab (Claude's artifact sandbox's `window.storage` API consistently failed). The workaround: a "📋 Save / Restore Watched List" panel that encodes the watched-match-key array as a `WC26-{base64}` string the user can copy, store themselves (Notes app, a message to self), and paste back in on a future visit to restore. A specific known-good restore code from an earlier session was baked in as a fallback default seed, so the tracker never starts completely blank even before real persistence existed.

This is kept in the current version as a secondary, manual way to move watched-progress between different browsers/devices — useful precisely because the real persistence (below) is per-browser via a cookie.

### 10. "Clear All Watched Matches"
Added after the user noticed there was no way to reset their watched list. Implemented as a tap-twice confirm pattern (first tap arms it with a "tap again to confirm" warning; second tap within 4 seconds actually clears; if you don't follow through it quietly re-arms itself back to normal) — specifically to avoid an accidental one-tap wipe of someone's whole tracked progress.

## Deployment

- **Netlify** project created (`ifreke-worldcup-tracker`), connected to this GitHub repo for continuous deployment.
- **Note on tooling limits encountered**: Claude's own sandboxed environment could not reach Netlify's deploy API directly (outbound network policy blocks Netlify's domains from that sandbox), so the initial deploy had to go through GitHub → Netlify's own auto-deploy-on-push, rather than Claude pushing a build directly. Worth knowing if a similar blocker comes up again with other hosts.

## Real persistence (Netlify Blobs)

See the dedicated PR for full detail, but in short: the manual export/import code system was the *only* persistence mechanism through the deployment milestone. The very first thing fixed after going live was wiring up actual server-side storage — a Netlify Function (`netlify/functions/watched-state.mts`) backed by Netlify Blobs, keyed by an anonymous per-visitor cookie, so watched state now saves and loads itself automatically with no login and no manual code-copying required for normal day-to-day use.

## Roadmap / planning work

A running `ROADMAP.md` was created to track bugs, in-progress work, backlog ideas, and completed items going forward, since the user expected to keep generating new ideas faster than they could be built. Alongside it, real research (not guesses) was done on:
- **Storage**: confirmed Netlify Blobs (free, zero-config) was the right fit before building anything — ruled out needing a separate database.
- **Auth**: confirmed Netlify's own former "Identity" product is deprecated; if/when accounts are wanted, Supabase Auth was identified as the most likely free-tier-friendly fit (also bundles Postgres + storage). Deliberately not built yet — no clear need for it until cross-device sync is actually requested.
- **Monetization reality check**: pulled current (2026) AdSense RPM benchmarks. Conclusion documented plainly: a single-tournament tracker is a poor fit for ad revenue both because of the traffic required (hundreds of thousands of monthly pageviews to reach meaningful income) and because interest is extremely seasonal — a structural problem no amount of design polish fixes on its own. Recommendation was to gather real traffic data post-launch before investing further here, rather than building monetization speculatively.

## Testing approach used throughout

Every change to the HTML artifact was validated with **Node.js + jsdom** before being shown to the user — loading the file with `runScripts:'dangerously'`, checking for thrown errors via `window.onerror`, and writing small targeted test scripts (simulating clicks, checking computed DOM state, verifying counts and data integrity) rather than relying on visual inspection alone, since Claude's environment can't render CSS visually. This caught several real bugs before they ever reached the user (e.g., the Group-view standings gap, the connector-line overlap, the responsive-mode boundary behavior).
