/**
 * Gamerplex Service Worker — enables PWA install + offline shell
 * Caches the app shell for instant load. Network-first for API/RPC calls.
 */

const CACHE_NAME = 'gamerplex-v1';
const APP_SHELL = [
  '/',
  '/games',
  '/leaderboard',
  '/docs',
  '/manifest.json',
];

// Install — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, fallback to cache for navigation
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET, RPC calls, and external APIs
  if (
    event.request.method !== 'GET' ||
    url.hostname.includes('solana.com') ||
    url.hostname.includes('magicblock.app') ||
    url.hostname.includes('run.app') ||
    url.pathname.startsWith('/api')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for app shell pages
        if (response.ok && APP_SHELL.includes(url.pathname)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
