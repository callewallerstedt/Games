// Simple offline-first service worker for the app shell.
// Bump CACHE when files change so clients pick up the new version.
const CACHE = "together-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/main.js",
  "./js/ui.js",
  "./js/net.js",
  "./js/session.js",
  "./js/qr.js",
  "./js/scan.js",
  "./js/games/registry.js",
  "./js/games/herd.js",
  "./js/games/hues.js",
  "./js/games/battleship.js",
  "./js/games/dice.js",
  "./js/games/tapple.js",
  "./js/games/guess.js",
  "./js/games/truefalse.js",
  "./js/games/triangles.js",
  "./js/games/crime.js",
  "./js/games/wouldyourather.js",
  "./js/games/howwell.js",
  "./js/games/twotruths.js",
  "./js/games/deepdive.js",
  "./js/games/impostor.js",
  "./js/data/herd-questions.js",
  "./js/data/decks.js",
  "./js/data/tapple-themes.js",
  "./js/data/guess-prompts.js",
  "./js/data/truefalse-facts.js",
  "./js/data/crime-cases.js",
  "./vendor/peerjs.min.js",
  "./vendor/qrcode.min.js",
  "./vendor/jsqr.min.js",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(request).then((hit) =>
      hit ||
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("./index.html")),
    ),
  );
});
