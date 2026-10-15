// Builds the stand-alone page's private extras from an export of the store. The output is never committed:
//   node snapshot.js <store-export-dir> > <scratch>/private.json && node seal.js <scratch>/private.json, then delete it.
// <store-export-dir> holds config/main.json, txns/*.json and points/*.json (ArtifactData "list" with out_dir).
// It carries the names, the Ask link, the HeyMax links, the balances the partner may use (points docs whose `users`
// include "b") and the confirmed Max Miles (FlyAnywhere can pay back anyone's ticket).
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");

const dir = process.argv[2];
if (!dir) { console.error("Usage: node snapshot.js <store-export-dir>"); process.exit(2); }
const docs = (sub) => {
  const d = path.join(dir, sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith(".json")).map((f) => Object.assign({ id: f.slice(0, -5) }, JSON.parse(fs.readFileSync(path.join(d, f), "utf8"))));
};
const main = JSON.parse(fs.readFileSync(path.join(dir, "config", "main.json"), "utf8"));
const cfg = E.mergeConfig(main);
// Today in Hong Kong, unless TODAY=YYYY-MM-DD is given.
const today = process.env.TODAY || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const st = E.status(docs("txns"), cfg, today);
const forB = (p) => (Array.isArray(p.users) && p.users.length ? p.users : [p.owner || "a"]).includes("b");
const out = {
  code: main.sealCode || "",
  people: main.people || {},
  ask: main.ask || {},
  links: main.heymaxLinks || {},
  points: docs("points").filter(forB),
  miles: { balance: Math.round(st.miles.balance), rentPayments: st.rently.payments, asOf: today },
};
process.stdout.write(JSON.stringify(out, null, 1) + "\n");
