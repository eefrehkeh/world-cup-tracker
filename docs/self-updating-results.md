# Design proposal: self-updating match data

> **Status:** Proposed — not started. This is a record of a discussion, captured for later.
> Nothing here is implemented yet.

## Problem

Match results and bracket progression are entered by hand. Each round means transcribing
scores from the FIFA PDF into `index.html`, filling in who advanced, and adding the next
round's ties. This is the only manual step left in running the site, and it's the tedious one.

Everything *downstream* of the raw data is already automated:

- **Standings** derive from scores via `computeStandingsFromMatches` — fix a score and every
  standings table that references it updates itself.
- **Highlight video IDs** self-heal through the YouTube backfill Action (`AUTOMATION.md`):
  a scheduled job polls the FOX Soccer uploads playlist and fills empty `videoId` fields
  within ~30 min of a highlight being posted.

The gap is that the match data itself — scores, statuses, which team advanced — still lives
in `index.html` and gets typed in by a person.

## Goal

Give the *match data* the same treatment the *video IDs* already get: a single external
source of truth, a scheduled job that writes it, and everything else derived from it. The
only remaining human task should be approving a change when something looks off.

## Approach

Three moves, in order of leverage.

### 1. Extract match data out of `index.html` into `results.json`

Today `DATA` (group stage), `KNOCKOUTS`, and the bracket arrays (`R32`/`R16`/`QF`/`SF`/…)
are baked into the HTML, so any update means editing markup. Move them into one JSON file —
matches keyed by id with home, away, score, status, round, plus the bracket `from:[...]`
feed structure. The page fetches it on load, or a small build step injects it.

This is the lowest-risk step and the one that unlocks the rest: after it, every future
update is "rewrite a JSON file," never "edit HTML." It also keeps a clean manual override —
because the data is just JSON, a human can still hand-edit it when a source is wrong.

### 2. Add a scheduled ingestion job (mirror the video backfill)

A `fetch_results.mjs` run by the same GitHub Actions pattern as the video backfill: on a
cron (e.g. every 30–60 min on match days), idempotent, no-ops when nothing changed — exactly
like the "0 new" runs today. Two candidate data sources:

**Option A — automate the FIFA PDF we already trust (tailored fit).**
The FIFA "Game Schedule & Where to Watch" PDF has a stable URL, `pdftotext -layout` already
extracts it cleanly, and it's the same source we validate against by hand today. This just
scripts the step we already do manually.
_Tradeoff:_ PDF parsing is brittle if FIFA changes the layout.

**Option B — a results API (cleaner data).**
A sports-data provider (football-data.org, API-Football on RapidAPI, or similar) returns
structured JSON, no parsing.
_Tradeoff:_ adds a vendor + API key + team-name mapping, and coverage of the 2026 World Cup
must be confirmed before committing. The existing `ALIASES` map from the video matcher could
be reused for name reconciliation.

### 3. Derive the bracket from results instead of typing in each round

The bracket already has `from:[...]` feeds, and standings already recompute from scores.
Apply the same principle to the tree: the winner of match N automatically becomes a team in
the next tie. Then a new round *appears on its own* the moment results land — no more
hand-entering "Round of 16: Canada vs Morocco."

## Safety (important — given prior bad-data incidents)

A web search once fabricated a scoreline (Norway 4–1 France, reversed from reality), which is
why the FIFA PDF became the trusted source. Any automated writer needs guardrails:

- The job should **open a PR** (or deploy to a preview) rather than push straight to
  production, so a human can glance at the diff.
- Add a **validation gate** that fails loudly on nonsense: scores within a sane range, every
  advancing team actually exists, no duplicate winners in a tie, no more games than a round
  can hold.
- Keep the **manual override**: `results.json` stays hand-editable for when a source is wrong.

## Net effect

The PDF (or API) becomes the single source of truth, a scheduled job writes `results.json`,
and the standings and bracket both derive themselves. The only remaining human job is
approving a PR when something looks off.

## Suggested first step (when we pick this up)

Start with move #1 — extract the data into `results.json`. It's high-leverage, low-risk, and
everything else builds on it. Moves #2 and #3 can follow independently.
