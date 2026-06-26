# Add real watched-list persistence via Netlify Blobs

## Summary

Replaces the manual export/import "restore code" system with automatic, server-side persistence. Watched matches now save and load themselves in the background — no copy/paste, no login required.

## Problem

The tracker previously relied on `window.storage`, a client-side API that's only available inside Claude's artifact preview sandbox. Once downloaded or deployed as a real site, that API doesn't exist, so watched-match state had no way to survive a page refresh. The workaround was a manual base64 "restore code" the user had to copy, save somewhere themselves, and paste back in on every new visit.

## Solution

Added a small serverless backend so the tracker can save/load state for itself, with no accounts and no database to manage.

### Architecture

```
Browser (index.html)
   │
   │  GET  /api/watched-state   → load saved matches on page load
   │  POST /api/watched-state   → save matches after any change (debounced)
   ▼
Netlify Function (netlify/functions/watched-state.mts)
   │
   │  reads/writes one JSON blob per visitor
   ▼
Netlify Blobs (zero-config, included free on Netlify)
```

**Visitor identity** — On a visitor's first request, the function generates a random UUID and sets it as an `httpOnly` cookie (`wc26_vid`, 1-year expiry). That UUID is the key used to read/write their blob. No login, no email, no personal info collected — just an anonymous per-browser identifier, the same model as a typical analytics or session cookie.

**Storage** — Each visitor's watched-match list is stored as a single JSON blob (`{ watched: string[], updatedAt: string }`) in a Netlify Blobs store named `watched-state`. Netlify provisions and manages this automatically; there's no database to set up, no connection string, no separate service.

**Client behavior**
- On page load, the tracker calls `GET /api/watched-state`. If the visitor has saved data, it loads that. If not (first-ever visit, or the function is temporarily unreachable), it falls back to a previously-seeded default list rather than starting completely empty.
- Whenever a match is checked/unchecked, the change applies to the UI immediately, then a save is scheduled via `POST /api/watched-state`, debounced ~500ms so rapid clicking doesn't fire a network request per click.
- The "Restore from a code" / "Save / Restore Watched List" panel is kept as-is. It's no longer the primary persistence mechanism, but it's still useful for manually moving watched progress between different browsers or devices, since the cookie (and therefore the saved state) is local to one browser.
- If the API is ever unreachable, the UI shows "Not saved between visits" (existing status indicator) instead of failing silently or throwing — the tracker stays fully usable, it just won't persist that session.

### Validation / safety
- The function validates incoming `watched` arrays server-side: must be an array, capped at 200 entries, each entry a string ≤120 chars. This is a generous ceiling (the tracker currently has ~103 total matches across group stage + knockout rounds) that prevents a malformed or malicious request from writing oversized garbage into a blob.
- Cookie is `httpOnly` (not readable by page JS — it doesn't need to be, since the page never reads the ID directly) and `Secure` (HTTPS only).
- No CORS headers added, since the function and the page are served from the same origin.

## Files changed

| File | Change |
|---|---|
| `netlify/functions/watched-state.mts` | **New.** GET/POST handler for loading/saving watched state. |
| `package.json` | **New.** Declares `@netlify/blobs` and `@netlify/functions` as dependencies. |
| `netlify.toml` | Added explicit `[functions]` directory config. |
| `index.html` | Replaced `window.storage`-based `loadWatchedState()` / `saveWatchedState()` with `fetch`-based versions calling the new API. Added `scheduleSaveWatchedState()` for debounced auto-save on checkbox changes. Added "Clear All Watched Matches" control (tap-twice confirm) to the existing backup panel. |

## How to verify after merge/deploy

1. Open the live site, check a handful of matches as watched.
2. Close the tab (or open in a new tab/incognito with the same browser profile) and reload.
3. Previously-checked matches should still show as watched, and the "You've Watched" counter should match.
4. Confirm the watched count is consistent across **By Group**, **By Date**, and **By Team** views (they all read from the same in-memory `watchedSet`, which is now backed by the saved blob).
5. Optional: open browser dev tools → Application/Storage → Cookies, confirm a `wc26_vid` cookie is present after first load.

## Out of scope for this PR
- Multi-device sync (would need real accounts — tracked separately on the roadmap)
- Any database beyond Netlify Blobs (not needed at this scale)
- Changes to the YouTube embed behavior (separate, unrelated bug — also worth re-testing now that we're deployed for real, since the original failure was likely specific to Claude's artifact sandbox)
