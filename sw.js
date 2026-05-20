const CACHE_NAME = 'droplink-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  './src/style.css',
  './src/noise.js',
  './src/webrtc.js',
  './src/crypto.js',
  './src/transfer.js',
  './src/ui.js',
  './src/app.js'
];

// Install event - cache core shell assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching core assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Clearing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Stale-While-Revalidate strategy
self.addEventListener('fetch', (e) => {
  // Only handle HTTP/HTTPS schemes (ignore chrome-extension, WebSockets, etc.)
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in the background to update cache
        fetch(e.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(e.request, networkResponse);
              });
            }
          })
          .catch(() => { /* Offline or network error - ignore */ });
        return cachedResponse;
      }

      // Network fallback
      return fetch(e.request).then((networkResponse) => {
        // Cache external dynamic resources (like google fonts) if successful
        if (networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, clone);
          });
        }
        return networkResponse;
      });
    })
  );
});
