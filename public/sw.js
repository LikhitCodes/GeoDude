/**
 * Feature 18: Offline-First Service Worker
 * Caches the application shell (HTML, CSS, JS, Fonts)
 * Navigation data (tiles, graphs) is handled separately by idb in offline-store.js
 */

const CACHE_NAME = 'trailsync-app-shell-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  // In a real Vite prod build, we'd use a manifest or Vite PWA plugin to inject built asset hashes.
  // For this prototype, we'll cache requests dynamically after the first load.
];

// Hostnames to never intercept (external APIs and tile servers)
const BYPASS_HOSTS = [
  'openstreetmap.org',     // Tile downloads (handled by IndexedDB)
  'tile.openstreetmap.org',
  'overpass-api.de',       // Road network API
  'overpass.kumi.systems',
  'overpass.openstreetmap.ru',
  'project-osrm.org',     // Routing engine
  'router.project-osrm.org',
  'nominatim.openstreetmap.org', // Geocoder
  'fonts.googleapis.com',  // Google Fonts (CORS issues with caching)
  'fonts.gstatic.com',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (e.g. POST to Overpass)
  if (event.request.method !== 'GET') return;

  // Skip WebSocket upgrade requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:') return;

  // Skip external API endpoints — they must always go to network
  if (BYPASS_HOSTS.some(host => url.hostname.includes(host))) return;

  // Skip Vite HMR requests during development
  if (url.pathname.includes('__vite') || url.pathname.includes('@vite')) return;

  // Cache-First strategy for app shell assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        // Don't cache non-successful responses
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        // Cache the response for future offline use
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Offline fallback for navigation requests (return cached index.html)
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        // For other resources, just fail silently
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});
