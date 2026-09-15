import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket) {
    // Atualiza token de autenticação sem destruir listeners existentes
    socket.auth = { token };
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  socket = io(window.location.origin, {
    path: '/ws',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Conectado em tempo real ao servidor');
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Erro de conexão:', err?.message);
    const freshToken = localStorage.getItem('wa_token');
    if (freshToken && socket) {
      socket.auth = { token: freshToken };
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Desconectado:', reason);
    if (reason === 'io server disconnect' || reason === 'transport close') {
      // Reconecta automaticamente em quedas de rede do celular/PWA
      setTimeout(() => {
        if (socket && !socket.connected) {
          socket.connect();
        }
      }, 1000);
    }
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function ensureSocketConnected(): void {
  if (socket && !socket.connected) {
    const freshToken = localStorage.getItem('wa_token');
    if (freshToken) {
      socket.auth = { token: freshToken };
    }
    socket.connect();
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
