// ============================================
// FuelOdo - Firebase Messaging Service Worker
// Place this at the root: /firebase-messaging-sw.js
// ============================================

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// IMPORTANT: Replace with your Firebase config
firebase.initializeApp({
  apiKey: "AIzaSyDADymYNw7riggIoyL2ljr99XOlzDj3UVw",
  authDomain: "fuelodo.firebaseapp.com",
  projectId: "fuelodo",
  storageBucket: "fuelodo.firebasestorage.app",
  messagingSenderId: "453359115282",
  appId: "1:453359115282:web:8bd126875931d0a7c30ccb",
  measurementId: "G-7GVZ52K6TF"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(payload => {
  console.log('[SW] Background message received:', payload);

  const notificationTitle = payload.notification?.title || 'FuelOdo Alert';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification.',
    icon: '/icon-192.png',
    badge: '/icon-96.png',
    tag: payload.data?.type || 'fuelodo',
    data: payload.data || {},
    actions: [
      { action: 'view', title: 'View App' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/app.html#dashboard');
      }
    })
  );
});
