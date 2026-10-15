// The stand-alone page works without signal: fresh copy when online (within 3.5 s), saved copy otherwise.
// Paths are relative to this file, so the page works from any folder (e.g. a GitHub Pages project site).
const CACHE = "which-card-2026-10-15-5ca2fce9";
const HOME = new URL("./", self.location).href;
const CORE = ["./", "app.css", "config.js", "engine.js", "app.js", "manifest.webmanifest", "icon-180.png", "icon-192.png",
  "cards/red.webp", "cards/red-thumb.webp", "cards/easy.webp", "cards/easy-thumb.webp"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    });
    network.catch(() => {}); // a late failure after the saved copy was served is fine
    try {
      return await Promise.race([network, new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 3500))]);
    } catch (err) {
      const saved = (await cache.match(req)) || (req.mode === "navigate" ? await cache.match(HOME) : undefined);
      return saved || network;
    }
  })());
});
