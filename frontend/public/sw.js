// Service Worker do Monteiro Conecta PWA com suporte a Web Push nativo
const CACHE_NAME = 'monteiro-conecta-v4';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
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

// Intercepta requisições de forma segura garantindo que event.respondWith SEMPRE retorne uma Response válida
self.addEventListener('fetch', (event) => {
  // Ignora chamadas de API, WebSockets e métodos não-GET
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/api/') ||
    event.request.url.includes('/ws') ||
    event.request.url.includes('/socket.io/')
  ) {
    return;
  }

  // Navegação SPA (ex: /settings, /conversations, /dashboard)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const indexHtml = await caches.match('/index.html');
          if (indexHtml) return indexHtml;
          return fetch('/index.html').catch(() => {
            return new Response(
              '<!DOCTYPE html><html><body><h3>Monteiro Conecta Offline</h3><p>Verifique sua conexao com a internet.</p></body></html>',
              { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
          });
        })
    );
    return;
  }

  // Recursos estáticos (imagens, scripts, css)
  event.respondWith(
    fetch(event.request)
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        // NUNCA retorne undefined para o respondWith: garante uma Response válida de erro
        return new Response('', { status: 404, statusText: 'Resource Not Found' });
      })
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
      // Se já houver uma janela aberta do PWA, foca nela e envia mensagem para abrir via SPA
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (data.conversationId && 'postMessage' in client) {
            client.postMessage({
              type: 'PUSH_OPEN_CONVERSATION',
              conversationId: data.conversationId,
              accountId: data.accountId,
            });
            return;
          }
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return;
        }
      }
      // Se o app estiver completamente fechado, abre uma nova janela
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
