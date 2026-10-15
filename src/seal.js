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
if (fs.existsSync(target)) {
  let same = false;
  try { same = open(JSON.parse(fs.readFileSync(target, "utf8"))) === payload; } catch (e) { same = false; }
  if (same) { console.log("sealed.json unchanged: same code and extras"); process.exit(0); }
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
