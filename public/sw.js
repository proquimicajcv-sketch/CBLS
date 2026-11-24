const BUILD_HASH = /* __CBLS_BUILD_HASH__ */ 'dev-v17';
const CACHE_NAME = `bitacora-cbls-${BUILD_HASH}`;

const CORE_STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/manifest.json?v=puma2',
  '/icon.svg',
  '/icon.svg?v=puma2',
  '/favicon-32x32.png',
  '/favicon-32x32.png?v=puma2',
  '/pwa-192x192.png',
  '/pwa-192x192.png?v=puma2',
  '/pwa-512x512.png',
  '/pwa-512x512.png?v=puma2',
  '/pwa-maskable-512x512.png',
  '/pwa-maskable-512x512.png?v=puma2',
  '/apple-touch-icon.png',
  '/apple-touch-icon.png?v=puma2',
  '/species/didelphis_marsupialis.jpg',
  '/species/caluromys_derbianus.jpg',
  '/species/chironectes_minimus.jpg',
  '/species/choloepus_hoffmanni.jpg',
  '/species/bradypus_variegatus.jpg',
  '/species/tamandua_mexicana.jpg',
  '/assets/aistudio/WhatsApp_Image_2026-11-12_at_10.43.47_e0604207.jpeg',
];

const BUILD_ASSET_MANIFEST = /* __CBLS_PRECACHE_MANIFEST__ */ [];

const ALL_PRECACHE_URLS = Array.from(
  new Set([...CORE_STATIC_ASSETS, ...BUILD_ASSET_MANIFEST]),
);

function shouldBypassServiceWorker(url) {
  // Never intercept non-HTTP(S) requests (chrome-extension, blob, data)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return true;
  }

  // Never cache live backend APIs or WebSocket endpoints
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) {
    return true;
  }

  // Never cache Firebase Auth, Firestore real-time streams, or Firebase Storage uploads
  if (
    url.hostname === 'firestore.googleapis.com' ||
    url.hostname === 'firebasestorage.googleapis.com' ||
    url.hostname === 'identitytoolkit.googleapis.com' ||
    url.hostname === 'securetoken.googleapis.com' ||
    url.hostname.endsWith('firebaseio.com') ||
    url.hostname.endsWith('firebaseapp.com')
  ) {
    return true;
  }

  // Allow Google Fonts caching; bypass Google Maps Platform tiles & API calls
  if (
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com'
  ) {
    return false;
  }

  if (
    url.hostname.endsWith('googleapis.com') ||
    url.hostname.endsWith('gstatic.com') ||
    url.hostname.endsWith('google.com')
  ) {
    return true;
  }

  return false;
}

async function precacheUrlsResilient(cache, urls) {
  await Promise.allSettled(
    urls.map(async (assetUrl) => {
      try {
        const request = new Request(assetUrl, { cache: 'reload' });
        const response = await fetch(request);
        if (response && response.ok) {
          await cache.put(assetUrl, response.clone());
        }
      } catch {
        // Keep install resilient if an optional dev asset is unreachable
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => precacheUrlsResilient(cache, ALL_PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key.startsWith('bitacora-cbls-') && key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
    const cleanUrls = data.urls.filter(
      (u) => typeof u === 'string' && u.startsWith('/'),
    );
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => precacheUrlsResilient(cache, cleanUrls)),
    );
  }
});

async function networkFirstWithTimeout(request, timeoutMs) {
  const cache = await caches.open(CACHE_NAME);

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });

  const networkPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok) {
        cache.put(request, networkResponse.clone()).catch(() => undefined);
      }
      return networkResponse;
    })
    .catch(() => null);

  const raceWinner = await Promise.race([networkPromise, timeoutPromise]);
  if (raceWinner && raceWinner.ok) {
    return raceWinner;
  }

  const cachedDirect = await cache.match(request);
  if (cachedDirect) return cachedDirect;

  const cachedIndex = (await cache.match('/index.html')) || (await cache.match('/'));
  if (cachedIndex) return cachedIndex;

  // Wait for slow network if cache is still empty
  const slowNetwork = await networkPromise;
  if (slowNetwork) return slowNetwork;

  return new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><title>Bitácora CBLS Offline</title><body style="background:#030F0A;color:#F2FAF5;font-family:sans-serif;padding:24px;"><h1>Bitácora CBLS sin conexión</h1><p>Abre la aplicación una vez con internet para guardar en caché los archivos iniciales.</p></body></html>',
    {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

async function cacheFirstOrRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkUpdate = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone()).catch(() => undefined);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Revalidate quietly in the background without blocking offline UI
    void networkUpdate;
    return cached;
  }

  const fresh = await networkUpdate;
  if (fresh) return fresh;

  return new Response('Offline: recurso estático no disponible sin conexión.', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (shouldBypassServiceWorker(url)) return;

  // Navigation requests (app shell HTML): Network-First with 2.5s timeout for weak mountain signal
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstWithTimeout(event.request, 2500));
    return;
  }

  // Google Fonts & Same-Origin Static Assets (JS, CSS, SVG, PNG, JPG, JSON): Cache-First + Revalidate
  if (
    url.origin === self.location.origin ||
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirstOrRevalidate(event.request));
  }
});
