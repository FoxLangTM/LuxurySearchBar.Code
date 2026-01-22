const CACHE_NAME = 'foxcorp-v2'; // Zmień wersję, gdy zaktualizujesz kod
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/Images/FoxCorp-192.png',
  '/Images/FoxCorp-512.png'
];

// Instalacja i zapisywanie plików do pamięci (Błyskawiczne ładowanie)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('FoxCorp Engine: Caching assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Aktywacja i usuwanie starych wersji (Sprzątanie)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

// Strategia: Najpierw Cache, potem Sieć (Ekstremalna szybkość)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});

