// Service Worker do Monteiro Conecta PWA com suporte a Web Push nativo
const CACHE_NAME = 'monteiro-conecta-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

let userSettings = {
  muted: false,
  schedule: { enabled: false, startTime: '08:00', endTime: '18:00', daysOfWeek: [1, 2, 3, 4, 5] },
};

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'UPDATE_SCHEDULE') {
    userSettings = {
      muted: !!event.data.muted,
      schedule: event.data.schedule || userSettings.schedule,
    };
  }
});

function isTimeWithinSchedule(schedule) {
  if (!schedule || !schedule.enabled) return true;
  const now = new Date();
  const day = now.getDay();
  if (Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.length > 0 && !schedule.daysOfWeek.includes(day)) {
    return false;
  }
  const [sH, sM] = (schedule.startTime || '08:00').split(':').map(Number);
  const [eH, eM] = (schedule.endTime || '18:00').split(':').map(Number);
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = (sH || 0) * 60 + (sM || 0);
  const end = (eH || 0) * 60 + (eM || 0);

  if (start <= end) {
    return cur >= start && cur <= end;
  } else {
    return cur >= start || cur <= end;
  }
}

// Intercepta requisições estáticas leves sem bloquear APIs/sockets
self.addEventListener('fetch', (event) => {
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/api/') ||
    event.request.url.includes('/ws') ||
    event.request.url.includes('/socket.io/')
  ) {
    return;
  }
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Recebe notificações Web Push mesmo com app fechado ou dispositivo bloqueado
self.addEventListener('push', (event) => {
  if (userSettings.muted) return;
  if (!isTimeWithinSchedule(userSettings.schedule)) return;

  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'Monteiro Conecta';
  const options = {
    body: data.body || 'Nova mensagem recebida',
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    tag: data.tag || (data.data?.conversationId ? `conv-${data.data.conversationId}` : 'mc-wa-msg'),
    renotify: true,
    vibrate: [100, 50, 100],
    data: data.data || {},
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Ao clicar na notificação nativa do iOS / Android / Desktop
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  let targetUrl = '/conversations';
  if (data.conversationId) {
    targetUrl = `/conversations?convId=${encodeURIComponent(data.conversationId)}`;
  } else if (data.url) {
    targetUrl = data.url;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já houver uma janela aberta do PWA, foca nela e navega
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Se o app estiver completamente fechado, abre uma nova janela
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
