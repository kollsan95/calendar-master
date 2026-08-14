const CACHE_NAME = 'calendar-pwa-v33';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/js/app.js',
    '/js/db.js',
    '/js/notifications.js',
    '/js/firebase-config.js',
    '/js/firebase-sync.js',
    '/js/auth.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js'
];

// === УСТАНОВКА ===
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                return cache.addAll(urlsToCache);
            })
            .then(function() {
                return self.skipWaiting();
            })
    );
});

// === АКТИВАЦИЯ ===
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(function() {
            return self.clients.claim();
        })
    );
});

// === ПЕРЕХВАТ ЗАПРОСОВ ===
self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

// === ЛОКАЛЬНЫЕ УВЕДОМЛЕНИЯ ===
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'scheduleNotification') {
        const { title, body, delay } = event.data;
        
        if (delay > 0) {
            setTimeout(function() {
                self.registration.showNotification(title, {
                    body: body,
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-72.png',
                    vibrate: [200, 100, 200],
                    tag: 'reminder-' + Date.now(),
                    requireInteraction: true
                });
            }, delay);
        }
    }
});

// === КЛИК ПО УВЕДОМЛЕНИЮ ===
self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.openWindow('/')
    );
});