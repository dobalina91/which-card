// Seals the stand-alone page's private extras: node seal.js <private.json>
// <private.json> is never committed; snapshot.js makes it from an export of the store. It holds { "code": "four words",
//   "people": { "a", "b" }, "ask": { "label", "to", "signal" }, "links": { "<HeyMax key>": "https://…" },
//   "points": [the partner's usable balances], "miles": { "balance", "rentPayments", "asOf" } }.
// Writes sealed.json: AES-256-GCM, key from the code by PBKDF2-SHA256. Without the code the block is unreadable;
// the page opens it with the code from its link (#code=…) or typed under ⓘ.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const src = process.argv[2];
if (!src) { console.error("Usage: node seal.js <private.json>"); process.exit(2); }
const priv = JSON.parse(fs.readFileSync(src, "utf8"));
const code = String(priv.code || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); // same rule as the page
if (code.length < 16) throw new Error("The access code is too short: use four random words");
const payload = JSON.stringify({ people: priv.people || {}, ask: priv.ask || {}, links: priv.links || {}, points: priv.points || [], miles: priv.miles || null });
const iter = 600000;
const target = path.join(__dirname, "sealed.json");

// Nothing to do when the current block already opens with this code and holds the same extras.
function open(sealed) {
  const key = crypto.pbkdf2Sync(code, Buffer.from(sealed.salt, "base64"), sealed.iter, 32, "sha256");
  const all = Buffer.from(sealed.ct, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
  d.setAuthTag(all.subarray(all.length - 16));
  return Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]).toString("utf8");
}
// Compares the extras whatever the order of their keys (the store may list fields in another order).
const canon = (v) => (v && typeof v === "object"
  ? (Array.isArray(v) ? "[" + v.map(canon).join(",") + "]"
    : "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}")
  : JSON.stringify(v));
if (fs.existsSync(target)) {
  let prev = null;
  try { prev = JSON.parse(open(JSON.parse(fs.readFileSync(target, "utf8")))); } catch (e) { prev = null; }
  const now = JSON.parse(payload);
  if (prev && canon(prev) === canon(now)) { console.log("sealed.json unchanged: same code and extras"); process.exit(0); }
  // Normally only miles (and points) change. Links, ask or people changing when the store didn't means a copying slip.
  if (prev) console.log("Changed:", Object.keys(now).filter((k) => canon(prev[k]) !== canon(now[k])).join(", "));
  else console.log("The current sealed.json doesn't open with this code: all the extras are new");
}
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(code, salt, iter, 32, "sha256");
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(payload, "utf8"), cipher.final(), cipher.getAuthTag()]); // WebCrypto layout
const out = { v: 1, iter, salt: salt.toString("base64"), iv: iv.toString("base64"), ct: ct.toString("base64") };

// Check it opens again before writing.
if (open(out) !== payload) throw new Error("Sealing check failed");

fs.writeFileSync(target, JSON.stringify(out, null, 1) + "\n");
console.log("sealed.json written:", Buffer.byteLength(payload), "bytes sealed,", Object.keys(priv.links || {}).length, "links");
