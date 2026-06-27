#!/usr/bin/env python3
"""
Apply verified YouTube video IDs from video_ids.json into index.html.

- Source of truth is video_ids.json (keys: "Home|Away|Date").
- Matches each match object by exact home/away/date, replaces its videoId value.
- Idempotent: safe to run repeatedly (it overwrites the videoId field each time).
- Never invents IDs; only writes what's in the JSON.
- Writes VIDEO_ID_REPORT.md grouping entries by confidence and listing what's still missing.

Usage:  python3 scripts/apply_video_ids.py
Run from the repo root (where index.html lives).
"""
import json, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JSON_PATH = os.path.join(ROOT, "video_ids.json")
HTML_PATH = os.path.join(ROOT, "index.html")
REPORT_PATH = os.path.join(ROOT, "VIDEO_ID_REPORT.md")

data = json.load(open(JSON_PATH, encoding="utf-8"))
html = open(HTML_PATH, encoding="utf-8").read()

applied, notfound, multi, skipped_empty = [], [], [], []

for key, v in data.items():
    if key.startswith("_"):
        continue
    parts = key.split("|")
    if len(parts) != 3:
        print(f"  !! malformed key (need Home|Away|Date): {key!r}")
        continue
    home, away, date = parts
    vid = (v.get("id") or "").strip()
    conf = v.get("confidence", "")
    if not vid:
        skipped_empty.append(key)
        continue
    pat = re.compile(
        r'(\{home:"%s",\s*away:"%s",\s*date:"%s",[^}]*?videoId:")[^"]*(")'
        % (re.escape(home), re.escape(away), re.escape(date))
    )
    new_html, n = pat.subn(lambda m: m.group(1) + vid + m.group(2), html)
    if n == 0:
        notfound.append(key)
    else:
        if n > 1:
            multi.append((key, n))
        html = new_html
        applied.append((key, vid, conf, v.get("src", "")))

open(HTML_PATH, "w", encoding="utf-8").write(html)

# How many videoIds remain empty in the file overall
remaining_empty = len(re.findall(r'videoId:"\s*"', html))
total_fields = len(re.findall(r"videoId:", html))

# ---- report ----
ver = [a for a in applied if a[2] == "verified"]
guess = [a for a in applied if a[2] == "best-guess"]
other = [a for a in applied if a[2] not in ("verified", "best-guess")]

lines = ["# Video ID Report", ""]
lines.append(f"- Total `videoId` fields in file: **{total_fields}**")
lines.append(f"- Filled this run / total in JSON: **{len(applied)}**")
lines.append(f"- Still empty in file: **{remaining_empty}**")
lines.append(f"- Verified: **{len(ver)}**  |  Best-guess: **{len(guess)}**")
lines.append("")
def block(title, rows):
    lines.append(f"## {title} ({len(rows)})")
    if not rows:
        lines.append("_none_"); lines.append(""); return
    for key, vid, conf, src in rows:
        h, a, d = key.split("|")
        lines.append(f"- {h} vs {a} ({d}) -> `{vid}`" + (f"  ({src})" if src else ""))
    lines.append("")
block("Verified", ver)
block("Best-guess - double-check these", guess)
if other:
    block("Other / untagged", other)
if notfound:
    lines.append(f"## NOT FOUND in index.html ({len(notfound)})")
    lines.append("_These JSON keys did not match any match object - check team name/date spelling._")
    for k in notfound:
        lines.append(f"- {k}")
    lines.append("")
if multi:
    lines.append(f"## WARNING: matched more than once ({len(multi)})")
    for k, n in multi:
        lines.append(f"- {k} matched {n} objects")
    lines.append("")
if skipped_empty:
    lines.append(f"## Present in JSON but no ID yet ({len(skipped_empty)})")
    for k in skipped_empty:
        lines.append(f"- {k}")
    lines.append("")
open(REPORT_PATH, "w", encoding="utf-8").write("\n".join(lines))

# ---- console summary ----
print(f"Applied {len(applied)} IDs ({len(ver)} verified, {len(guess)} best-guess).")
print(f"index.html now has {remaining_empty} empty videoId fields remaining (of {total_fields}).")
if notfound:
    print(f"!! {len(notfound)} JSON keys did NOT match any match object:")
    for k in notfound: print(f"     {k}")
if multi:
    print(f"!! {len(multi)} keys matched more than one object (check report).")
print(f"Wrote {os.path.relpath(REPORT_PATH, ROOT)}")
