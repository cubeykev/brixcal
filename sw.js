/* BrixCal Service Worker - Offline First */
const CACHE_VERSION = "brixcal-v1"; // kalau update besar, ganti jadi v2, v3, dst

// File inti yang WAJIB ada untuk offline
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./table_brix.json",
  "./manifest.webmanifest",
  "./sw.js",
  "./icon-192.png",
  "./icon-512.png"
];

// Install: cache file inti
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // addAll akan gagal kalau ada file tidak ada.
      // Jadi kita cache satu-satu agar tetap sukses walau icon belum ada.
      for (const url of CORE_ASSETS) {
        try { await cache.add(url); } catch (e) { /* ignore missing */ }
      }
      self.skipWaiting();
    })()
  );
});

// Activate: hapus cache lama
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k !== CACHE_VERSION ? caches.delete(k) : Promise.resolve()))
      );
      self.clients.claim();
    })()
  );
});

// Fetch strategy:
// - Untuk navigasi (halaman): cache-first, fallback ke index.html
// - Untuk table_brix.json: stale-while-revalidate (cepat + update kalau online)
// - Untuk lainnya: cache-first, fallback network
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // hanya handle request dari origin yang sama (GitHub Pages kamu)
  if (url.origin !== self.location.origin) return;

  // Navigasi halaman
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match("./index.html");
        try {
          const fresh = await fetch(req);
          // update cache halaman terbaru
          cache.put("./index.html", fresh.clone());
          return fresh;
        } catch (e) {
          // offline -> pakai cache
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Khusus table_brix.json -> stale-while-revalidate
  if (url.pathname.endsWith("/table_brix.json") || url.pathname.endsWith("table_brix.json")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const cached = await cache.match("./table_brix.json");
        const fetchPromise = fetch(req)
          .then((fresh) => {
            cache.put("./table_brix.json", fresh.clone());
            return fresh;
          })
          .catch(() => null);

        // kalau ada cache -> langsung pakai, sambil update di background
        if (cached) {
          event.waitUntil(fetchPromise);
          return cached;
        }

        // kalau tidak ada cache -> coba network
        const fresh = await fetchPromise;
        return fresh || Response.error();
      })()
    );
    return;
  }

  // Asset lain: cache-first
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        // cache asset yang sukses
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        return Response.error();
      }
    })()
  );
});
