// Minimal service worker so the app can be installed as a PWA and load offline.
const CACHE = "bolo-bijli-v1";
const FILES = ["/", "/index.html", "/style.css", "/app.js", "/i18n.js", "/manifest.json", "/icon.svg"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || e.request.url.includes("/api/")) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
