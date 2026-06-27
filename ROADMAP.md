# World Cup Tracker — Roadmap & Board

_Last updated: June 27, 2026_

A running list of bugs, fixes, and feature ideas. Add new ideas to **Backlog** as they come up; move things across columns as they progress.

---

## 🔴 Bugs

- _None open._ (The old "content blocked" / Error 153 on embeds was confirmed to be a Claude-sandbox / `file://` artifact — embeds play correctly on the live Netlify domain.)

## 🟡 In Progress / Next Up

- _Nothing in flight — core v1 is complete and live._

## 🔵 Backlog (ideas, not yet started)

- [ ] User accounts / login (Google, Apple, etc.) so watched progress follows a person across devices
- [ ] Visual redesign pass — hero treatment, possibly a photo carousel of real World Cup moments
- [ ] Stats tracker: top scorers, cards, clean sheets, historical World Cup facts
- [ ] Ads / monetization — pending traffic realism (see notes below)
- [ ] Cross-check the knockout bracket's `from:[...]` feed mapping against FIFA's official Round of 16 draw once announced
- [ ] Mobile app wrapper? (probably overkill for v1 — revisit if traffic justifies it)

## ✅ Done

- [x] **Confirmed highlight embeds play on the live Netlify domain** — the earlier Error 153 was a Claude-sandbox / `file://` artifact, not a real bug
- [x] **Real Fox Soccer highlight video IDs** filled for every played match (60/71) — verified FOX uploads, sourced through `video_ids.json` + `scripts/apply_video_ids.py`; the remaining 11 are unplayed or have no FOX upload yet
- [x] **Highlight video moved above the reveal-score button** as a click-to-play embed (thumbnail loads the player on click), plus a **site-wide toggle** to switch all videos between hero and compact size (choice persists across visits)
- [x] Group stage tracker: all 12 groups, 71 matches, spoiler-protected scores
- [x] By Group / By Date / By Team / Bracket views
- [x] Progressive standings tables (group & date views)
- [x] Watched-match tracking + session counter
- [x] Manual export/import "restore code" for watched list (kept as a cross-device backup option, no longer the primary persistence mechanism)
- [x] **Deployed to Netlify**, linked to GitHub repo for auto-deploy on push
- [x] **Real watched-list persistence** — Netlify Function (`netlify/functions/watched-state.mts`) + Netlify Blobs, keyed by an anonymous per-visitor cookie. No login needed; saves automatically (debounced) whenever watched state changes.
- [x] Removed the old `DEFAULT_WATCHED_CODE` seed — it was leftover from before real persistence existed and was incorrectly pre-checking the same 40 historical matches for every new visitor (and overriding genuinely-empty saved states). New/empty states now correctly start at 0.
- [x] "Clear All Watched Matches" button (tap-twice confirm pattern, can't be triggered by accident)
- [x] YouTube highlight search links (Supersport, FIFA, ESPN FC, Fox Sports, Fox Soccer)
- [x] Embedded video player slot per match (pending real video IDs; embed mechanism itself should now work since we're off Claude's sandbox)
- [x] Visual knockout bracket (Round of 32 → Final) with real connector lines
- [x] Responsive bracket: full-width stretch on desktop, horizontal scroll mid-size, swipeable paging on mobile
- [x] Full-bleed bracket layout on wide screens

---

## 📌 Research Notes (so far)

### Storage — now implemented
Went with **Netlify Blobs**, accessed through a small serverless function (`/api/watched-state`, GET to load / POST to save). Visitors get an anonymous random ID in an httpOnly cookie on first visit — no accounts, no passwords, nothing for the user to set up. The client fetches saved state on page load and pushes updates automatically (debounced ~500ms after the last checkbox click) — no manual "save" step needed day to day. The old export/import code system is kept as a secondary option for moving watched-progress between browsers/devices, since the cookie is per-browser.

### Auth options (if/when we want accounts)
- Netlify's own "Identity" product is **deprecated** — not an option.
- **Supabase Auth** — free tier, handles Google/Apple/etc. social login, and also gives us a real Postgres database + storage in one place if we ever outgrow Blobs. Has a direct connector available.
- **Firebase Auth** — also free-tier friendly, deep Google ecosystem integration, slightly less appealing if we don't want to also adopt Firestore.
- Recommendation: hold off on accounts until there's a reason (e.g., people actually asking to sync across devices). It's real scope — sign-up flows, password resets, session handling — not a small add-on.

### Ads / monetization reality check
Pulled current benchmarks (mid-2026):
- Typical AdSense RPM (revenue per 1,000 pageviews) for a general-interest site: **$2–$10**, with sports/entertainment content usually on the lower end of that.
- At a $5 RPM, **20,000 monthly pageviews ≈ $100/month**. At $10 RPM, same traffic ≈ $200/month.
- To hit something like $3,000/month from ads alone, realistic estimates land around **300,000–600,000 monthly pageviews** — a lot of traffic for a single-tournament tracker.
- Practical read: a World Cup tracker has a built-in problem for ad revenue — it's extremely seasonal (huge interest for ~6 weeks every 2–4 years, then nothing). That hurts both traffic consistency and advertiser demand outside the tournament window.
- Bottom line: don't plan around meaningful ad income unless this grows into something with much bigger, more consistent traffic (e.g., expanding beyond just the World Cup to year-round soccer content). Worth tracking traffic for a few weeks post-launch to get real numbers before investing more time in monetization.

### Hosting
- Netlify free tier: 100GB bandwidth/month, 300 build minutes, 125k function calls, 10GB Blob storage — plenty for this project at any realistic traffic level for now.
