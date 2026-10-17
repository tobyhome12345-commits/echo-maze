// Echo Maze's service worker (v15.6): what lets the installed web app open with no connection.
// NETWORK FIRST: whenever there is a connection the game is loaded fresh from the website, so a new version
// is simply there the next time it is opened - nothing to download again. The copy kept here is used only
// when the network cannot be reached. Same-origin GETs only; nothing about the player is ever sent anywhere.
const CACHE = 'echo-maze';
const PAGE = new URL('./', self.location).href; // the game's page, whatever query it was opened with

// Every file the page loads, read from the page itself, so a new script never needs adding to a list here.
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch(PAGE, { cache: 'no-cache' });
    if (!res.ok) return;
    const html = await res.clone().text();
    await cache.put(PAGE, res);
    const files = new Set(['manifest.webmanifest']);
    for (const m of html.matchAll(/(?:src|href)="([^"#:?]+)"/g)) files.add(m[1]);
    await Promise.all([...files].map(async (f) => {
      try {
        const r = await fetch(f, { cache: 'no-cache' });
        if (r.ok) await cache.put(new URL(f, PAGE).href, r);
      } catch (err) {
        /* offline while installing: it is fetched again the next time */
      }
    }));
  })().catch(() => {}));
});

self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const isPage = (req, url) => req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = isPage(req, url) ? PAGE : url.origin + url.pathname;
  e.respondWith((async () => {
    try {
      // (a navigation cannot be re-fetched with options, so it is fetched by its address)
      const res = await fetch(req.mode === 'navigate' ? req.url : req, { cache: 'no-cache' });
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(key);
      return hit || Response.error();
    }
  })());
});
