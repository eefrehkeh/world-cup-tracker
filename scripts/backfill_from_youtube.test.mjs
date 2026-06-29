// Offline test for the FOX-upload matcher. No network/API key needed.
// Run: node scripts/backfill_from_youtube.test.mjs

import { pickForMatch, isMatchHighlight, titleHasTeam, norm, cutRank, backfillSinceDate } from "./backfill_from_youtube.mjs";

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

// Standard cut is preferred over Extended for the same match/date.
check("prefers standard cut", pickForMatch("Brazil|Morocco|Jun 13", [
  { title: "Brazil vs Morocco Extended Highlights 🌎🏆 2026 FIFA World Cup™", id: "EXT", published: "2026-06-13T23:00:00Z" },
  { title: "Brazil vs Morocco Highlights 🌎🏆 2026 FIFA World Cup™", id: "STD", published: "2026-06-13T23:30:00Z" },
]).id === "STD");

// Reversed fixture (tracker lists Qatar|Bosnia; FOX titled it Bosnia vs Qatar).
check("matches reversed fixture", pickForMatch("Qatar|Bosnia and Herzegovina|Jun 24", [
  { title: "Bosnia and Herzegovina vs Qatar Extended Highlights 🌎🏆 2026 FIFA World Cup™", id: "BHQ", published: "2026-06-24T22:00:00Z" },
]).id === "BHQ");

// Accents normalize (Türkiye / Curaçao).
check("handles accented names", pickForMatch("Australia|Türkiye|Jun 13", [
  { title: "Australia vs Türkiye Highlights 🌎🏆 2026 FIFA World Cup™", id: "AUT", published: "2026-06-14T02:00:00Z" },
]).id === "AUT");

// Austria must NOT match an Australia upload (boundary check).
check("does not confuse Austria with Australia", pickForMatch("Argentina|Austria|Jun 22", [
  { title: "Argentina vs Australia Highlights 🌎🏆 2026 FIFA World Cup™", id: "WRONG", published: "2026-06-22T20:00:00Z" },
  { title: "Argentina vs Austria Extended Highlights 🌎🏆 2026 FIFA World Cup™", id: "RIGHT", published: "2026-06-22T22:00:00Z" },
]).id === "RIGHT");

// Goal clips, interviews, and game-sim uploads are rejected; the real highlight wins.
check("ignores goal/interview/sim decoys", pickForMatch("Egypt|Iran|Jun 26", [
  { title: "Egypt's Mahmoud Saber scores goal, taking early lead vs Iran | 2026 FIFA World Cup™", id: "GOAL", published: "2026-06-26T20:00:00Z" },
  { title: "Egypt vs Iran | Complete Match Highlights | FC26", id: "SIM", published: "2026-06-26T20:00:00Z" },
  { title: "Egypt vs Iran Extended Highlights 🌎🏆 2026 FIFA World Cup™", id: "REAL", published: "2026-06-26T23:00:00Z" },
]).id === "REAL");

// Date window rejects a same-pairing rematch far from the match date.
check("date window rejects far-off rematch", pickForMatch("England|Croatia|Jun 17", [
  { title: "England vs Croatia Extended Highlights 🌎🏆 2026 FIFA World Cup™", id: "KO", published: "2026-07-05T20:00:00Z" },
]) === null);

// No candidate -> null.
check("returns null when nothing matches", pickForMatch("Curaçao|Ivory Coast|Jun 25", [
  { title: "Some unrelated FOX upload about the MLS", id: "X", published: "2026-06-25T20:00:00Z" },
]) === null);

// Unit checks.
check("isMatchHighlight rejects 'Best Moments'", !isMatchHighlight("Matchday 14 Best Moments 🌎🏆 2026 FIFA World Cup™"));
check("titleHasTeam DR Congo alias", titleHasTeam(norm("Colombia vs Congo DR Extended Highlights 2026 FIFA World Cup"), "DR Congo"));
check("cutRank orders std<ext<fast", cutRank("X vs Y Highlights") < cutRank("X vs Y Extended Highlights") && cutRank("X vs Y Extended Highlights") < cutRank("X vs Y Fast Highlights"));

// backfillSinceDate: earliest empty match minus the 3-day window sets the scan depth.
check("backfillSinceDate uses earliest empty minus window",
  backfillSinceDate(["A|B|Jun 27", "C|D|Jun 25", "E|F|Jul 02"]).toISOString().slice(0, 10) === "2026-06-22");
check("backfillSinceDate null with no datable keys", backfillSinceDate([]) === null && backfillSinceDate(["X|Y|tbd"]) === null);

console.log(failures ? `\n${failures} FAILED` : "\nAll tests passed");
process.exit(failures ? 1 : 0);
