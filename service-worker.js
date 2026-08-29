/* Times Dash — offline cache. Bump CACHE when files change. */
var CACHE = "tth-v13";
var ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  // never touch cross-origin (Supabase auth/data API) — straight to the network
  if (url.origin !== self.location.origin) return;

  // The page shell (HTML navigations) is network-first so a new release shows up
  // on the next load instead of being pinned to the cache.
  var isHTML = req.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html");
  if (isHTML) {
    e.respondWith(
      fetch(req).then(function (res) {
        try { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); } catch (err) {}
        return res;
      }).catch(function () {
        return caches.match(req).then(function (c) { return c || caches.match("./index.html"); });
      })
    );
    return;
  }

  // Other same-origin assets: serve cached fast, refresh in the background (stale-while-revalidate).
  e.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (res) {
        try { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); } catch (err) {}
        return res;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});
