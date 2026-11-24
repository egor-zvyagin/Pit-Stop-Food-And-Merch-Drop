/**
 * Pit Stop Food & Merch Drop - Service Worker
 * Offline resilience for trackside stations at the 2026 Melbourne Grand Prix.
 * 
 * Provides:
 * - Pre-caching of app shell navigation routes
 * - Cache-first strategy for static photography (/images/*.jpg, *.png)
 * - Stale-while-revalidate / cache-fallback for crypto public key (/api/crypto/public-key)
 * - Network-first with cache-fallback for navigation pages during trackside signal loss
 */

const CACHE_NAME = 'pitstop-cache-v2';

// Icon data is fetched from these hosts at runtime; cached so icons survive offline.
const ICON_API_HOSTS = ['api.iconify.design', 'api.simplesvg.com', 'api.unisvg.com'];

const STATIC_ASSETS = [
  '/',
  '/order',
  '/checkout',
  '/collect',
  '/pass',
  '/vendor',
  '/rewards',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/images/redbull.jpg',
  '/images/loaded-fries.jpg',
  '/images/beer.jpg',
  '/images/water.jpg',
  '/images/cap.jpg',
  '/images/pizza.jpg',
  '/images/tee.jpg',
  '/images/burger.jpg',
  '/images/earplugs.jpg',
  '/images/PIT_STOP.png',
  '/images/qr_code_figma.png',
];

// Install: pre-cache critical app shell and static images
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Use individual caching to prevent one failed asset from breaking install
      await Promise.allSettled(
        STATIC_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'no-cache' });
            if (response.ok) {
              await cache.put(url, response);
            }
          } catch (err) {
            console.warn('[SW] Failed to pre-cache:', url, err);
          }
        })
      );
    })
  );
});

// Activate: clean up outdated caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Strategy 1: Static images (/images/*) -> Cache First with Network Fallback
  if (url.pathname.startsWith('/images/') || request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        }).catch(() => {
          // Fallback if offline and image not in cache
          return new Response('', { status: 404, statusText: 'Not Found' });
        });
      })
    );
    return;
  }

  // Strategy 2: Pass verification key -> Network First with Cache Fallback.
  // Online, a kiosk always gets the current key (so a rotated key takes effect
  // at once); offline, it gets the last one it saw.
  if (url.pathname === '/api/crypto/public-key') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cachedResponse = await cache.match(request);
          return cachedResponse || new Response(JSON.stringify({ error: 'Offline - Public key unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      })
    );
    return;
  }

  // Strategy 2b: Icon data from the Iconify API -> Stale-While-Revalidate.
  // Icons render from cache at once and offline; the cache refreshes in the background.
  if (ICON_API_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        }).catch(() => null);

        if (cachedResponse) {
          event.waitUntil(fetchPromise);
          return cachedResponse;
        }
        return (await fetchPromise) || new Response('{}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Strategy 3: HTML Navigation Requests (App Shell) -> Network First with Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        }
        return networkResponse;
      }).catch(async () => {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Fallback to cached root
        const rootFallback = await caches.match('/');
        if (rootFallback) {
          return rootFallback;
        }
        return new Response('<h1>Offline</h1><p>Pit Stop is running offline. Please reconnect when in range.</p>', {
          status: 503,
          headers: { 'Content-Type': 'text/html' },
        });
      })
    );
    return;
  }

  // Strategy 4: Next.js static bundles (_next/static/*) -> Cache First
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Other API calls are live data: never answer them from cache.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Default: Network with Cache Fallback
  event.respondWith(
    fetch(request).catch(async () => (await caches.match(request)) || Response.error())
  );
});
