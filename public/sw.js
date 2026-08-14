// public/sw.js
// Service Worker para DETECCION-SISMO PWA (Cache Offline + Web Push)

const CACHE_NAME = 'sismo-cache-v1.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/map.js',
  '/js/audio.js',
  '/js/waves.js',
  '/js/timeline.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap'
];

// 1. Instalación: Cachear la app shell básica
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('⚡ [ServiceWorker] Pre-cacheando assets de la aplicación...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('⚠️ Algunos assets externos no pudieron ser pre-cacheados:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. Activación: Limpieza de versiones viejas de caché
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🗑️ [ServiceWorker] Eliminando caché antiguo:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Estrategia de Fetch: Network-first para API/Sockets, Stale-while-revalidate para estáticos
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorar WebSocket y llamadas POST/PUT
  if (event.request.method !== 'GET' || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // Rutas de API REST: Siempre red directa (Network-first)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'offline', offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Assets estáticos y Tiles: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// 4. Recepción de Notificaciones Push en segundo plano
self.addEventListener('push', (event) => {
  let data = { title: '🚨 Alerta Sísmica', body: 'Nuevo sismo detectado', tag: 'sismo-alerta' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body || 'Nuevo evento registrado por las redes sismológicas.',
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    vibrate: [200, 100, 200, 100, 400],
    data: data.url || '/',
    tag: data.tag || 'sismo-general',
    renotify: true,
    requireInteraction: true
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// 5. Clic en notificación: Abrir o enfocar la PWA
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
