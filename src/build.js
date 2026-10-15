// Builds both pages from one source: node build.js
//   dist/index.html  The main page, published as a Claude artifact (shared store, Claude look-ups).
//   dist-site/       The partner's stand-alone page (GitHub Pages): card advice only, settings from site.json, works
//                    offline. SITE_OUT=<folder> writes it elsewhere, e.g. a checkout of the gh-pages branch.
// Names and private links are never in these files: the main page reads them from its store, the stand-alone page
// carries them encrypted (sealed.json, made by seal.js) and opens them with the access code.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const here = (f) => path.join(__dirname, f);
const read = (f) => fs.readFileSync(here(f), "utf8");

function inline(html) {
  for (const [mark, file] of [["/*CSS*/", "style.css"], ["/*ENGINE*/", "engine.js"], ["/*APP*/", "app.js"]]) {
    if (!html.includes(mark)) throw new Error("Missing placeholder " + mark);
    const src = read(file);
    if (/<\/(script|style)/i.test(src)) throw new Error(file + " contains a closing tag that would break the page");
    html = html.replace(mark, () => src);
  }
  return html;
}

// The main page: the artifact host adds the document skeleton.
const shell = read("shell.html");
const main = inline(shell);
fs.mkdirSync(here("dist"), { recursive: true });
fs.writeFileSync(here("dist/index.html"), main);

// The stand-alone page: a complete document with its own skeleton and web-app tags. Styles and scripts are separate
// files, and its card settings sit alone in config.js, so a card change only re-sends that one small file.
const site = JSON.parse(read("site.json"));
const sealed = fs.existsSync(here("sealed.json")) ? JSON.parse(read("sealed.json")) : null;
if (sealed && !(sealed.v === 1 && sealed.salt && sealed.iv && sealed.ct && sealed.iter >= 100000)) throw new Error("sealed.json is not a sealed block");
const embed = { mode: "solo", payer: site.payer === "a" ? "a" : "b", builtOn: site.builtOn, cfg: site.cfg, welcomeDone: site.welcomeDone || [], sealed };
const split = shell.indexOf('<div class="app">');
const head = shell.slice(0, split).replace(/<style>[\s\S]*?<\/style>\n?/, '<link rel="stylesheet" href="app.css">\n');
const scripts = shell.slice(shell.indexOf("<script>\n/*ENGINE*/"));
const body = shell.slice(split, shell.indexOf("<script>\n/*ENGINE*/")) +
  '<script src="config.js"></script>\n<script src="engine.js"></script>\n<script src="app.js"></script>\n';
if (!scripts.includes("/*APP*/")) throw new Error("Unexpected shell layout");
const configJs = "window.WC_EMBED = " + JSON.stringify(embed, null, 1) + ";\n";
// The service worker's cache name changes with the content, so phones pick up every new version.
const version = site.builtOn + "-" + crypto.createHash("sha256").update(read("style.css") + read("engine.js") + read("app.js") + configJs + shell).digest("hex").slice(0, 8);
const siteHtml = (
  '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
  '<meta name="robots" content="noindex, nofollow">\n' +
  '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n' +
  '<meta name="apple-mobile-web-app-title" content="Which Card">\n<meta name="apple-mobile-web-app-status-bar-style" content="default">\n' +
  '<meta name="theme-color" content="#eef1f4" media="(prefers-color-scheme: light)">\n<meta name="theme-color" content="#0c1015" media="(prefers-color-scheme: dark)">\n' +
  '<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-180.png">\n<link rel="icon" href="icon-192.png">\n' +
  "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n" +
  head + "</head>\n<body>\n" + body +
  '<script>if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });</script>\n' +
  "</body>\n</html>\n"
);
const out = process.env.SITE_OUT ? path.resolve(process.env.SITE_OUT) : here("dist-site");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), siteHtml);
fs.writeFileSync(path.join(out, "sw.js"), read("sw.js").replace("__VERSION__", version));
fs.writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify({
  // No start_url: an icon added to the home screen opens the address it was added from (with #code=… if any).
  name: "Which Card?", short_name: "Which Card", scope: "./", display: "standalone",
  background_color: "#eef1f4", theme_color: "#eef1f4",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
}, null, 2));
fs.writeFileSync(path.join(out, "robots.txt"), "User-agent: *\nDisallow: /\n");
fs.writeFileSync(path.join(out, ".nojekyll"), "");
fs.writeFileSync(path.join(out, "app.css"), read("style.css"));
fs.writeFileSync(path.join(out, "engine.js"), read("engine.js"));
fs.writeFileSync(path.join(out, "app.js"), read("app.js"));
fs.writeFileSync(path.join(out, "config.js"), configJs);
for (const icon of ["icon-180.png", "icon-192.png", "icon-512.png"]) fs.copyFileSync(here("assets/" + icon), path.join(out, icon));

// Card pictures: published next to both pages under cards/ (the artifact gets them through the publish `files`).
const CARD_FILES = ["red.webp", "red-thumb.webp", "easy.webp", "easy-thumb.webp"];
for (const dir of [here("dist/cards"), path.join(out, "cards")]) {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of CARD_FILES) fs.copyFileSync(here("assets/cards/" + f), path.join(dir, f));
}

const kib = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + " KiB";
console.log("dist/index.html", kib(main), "| site: " + path.relative(process.cwd(), path.join(out, "index.html")), kib(siteHtml), sealed ? "(sealed extras)" : "(no sealed extras)", "| cards", CARD_FILES.length);
