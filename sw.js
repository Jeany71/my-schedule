const CACHE = "my-schedule-v20";
const CORE = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("my-schedule-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Do not cache Firebase, Google, or other third-party requests.
  if (url.origin !== self.location.origin) return;

  const isAppShell = CORE.some(path => new URL(path, self.location.href).pathname === url.pathname) || request.mode === "navigate";
  if (!isAppShell) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Always prefer the deployed GitHub Pages files so fixes are not hidden
      // behind an older cache. Keep a copy for offline use.
      const fresh = await fetch(request, { cache: "no-store" });
      if (fresh && fresh.ok) await cache.put(request, fresh.clone());
      return fresh;
    } catch (error) {
      return (await cache.match(request)) || (await cache.match("./index.html"));
    }
  })());
});
