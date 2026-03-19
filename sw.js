// Service Worker für PWA: Cache-First Strategie für statische Assets
const CACHE_NAME = 'flashcards-v1'; // Version für Updates
const urlsToCache = [
  './', // <-- Geändert: './' statt '/' (relativ zum Scope)
  './index.html', // <-- Geändert: './index.html'
  './style.css',
  './app.js',
  './data/Long-Chinesisch_Lektionen.csv', // Relativ – passt
  './manifest.json'
  // Füge Icons hinzu, z. B.: './icons/icon-192.png', './icons/icon-512.png'
];

// Install: Cache alle Assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('SW: Caching Assets'); // Debug
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // SW sofort aktivieren
  );
});

// Activate: Alte Caches löschen
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Deleting old cache', cacheName); // Debug
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // SW für alle Tabs übernehmen
  );
});

// Fetch: Cache-First (offline aus Cache, online updaten) – angepasst für Subpfad
self.addEventListener('fetch', event => {
  // Nur für gleiche Origin (nicht für externe Ressourcen wie Fonts, falls verwendet)
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          // Cache hit: Rückgabe
          if (response) {
            // Für index.html: Online updaten (background fetch)
            if (event.request.destination === 'document') {
              return fetch(event.request).then(fetchResponse => {
                // Cache updaten für nächsten Aufruf
                const cache = caches.open(CACHE_NAME);
                cache.put(event.request, fetchResponse.clone());
                return fetchResponse;
              }).catch(() => response); // Offline: Cache nutzen
            }
            return response;
          }
          // Cache miss: Online fetchen und cachen
          return fetch(event.request).then(fetchResponse => {
            if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
              return fetchResponse;
            }
            const cache = caches.open(CACHE_NAME);
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          }).catch(err => {
            console.log('SW: Fetch failed (offline), no cache:', err); // Debug
            // Fallback für index.html: Zeige Offline-Seite oder leere Response
            if (event.request.destination === 'document') {
              return caches.match('./'); // <-- Geändert: './' für Home
            }
            return new Response('Offline: Keine Verbindung.', { status: 503 });
          });
        })
    );
  }
});