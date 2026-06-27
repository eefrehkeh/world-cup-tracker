// Loads index.html in jsdom, simulates the no-network / no-storage environment,
// and reports runtime errors + how many videoIds are filled.
// Run from repo root:  npm i jsdom  &&  node scripts/render_check.mjs
import { JSDOM } from "jsdom";
import fs from "fs";

const html = fs.readFileSync("index.html", "utf8");
const errs = [];

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  beforeParse(w) {
    // The watched-state API + any embeds are not reachable in this harness.
    w.fetch = () => Promise.reject(new Error("no-network-in-test"));
    // window.storage may be absent outside the artifact runtime; the app guards for it.
  },
});
dom.window.addEventListener("error", (e) =>
  errs.push(e.error?.message || String(e.message || e))
);

setTimeout(() => {
  const filled = (html.match(/videoId:"[^"]+"/g) || []).length;
  const empty = (html.match(/videoId:"\s*"/g) || []).length;
  console.log(`videoIds filled: ${filled}  | empty: ${empty}`);
  if (errs.length) {
    console.log(`RUNTIME ERRORS (${errs.length}):`);
    errs.forEach((e) => console.log("  - " + e));
    process.exit(1);
  }
  console.log("No runtime errors. Render OK.");
  process.exit(0);
}, 1500);
