import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string, onReconnect?: () => void): Socket {
  // FIX 5: Destrói socket anterior antes de criar novo, evitando handlers duplicados
  if (socket) {
    if (socket.connected) return socket;
    // Socket existe mas desconectado — destrói completamente antes de recriar
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  socket = io(window.location.origin, {
    path: '/ws',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
    reconnectionAttempts: Infinity, // FIX 5: tenta reconectar indefinidamente
  });

  // FIX 5: Notifica o frontend após reconexão para recarregar dados
  if (onReconnect) {
    socket.on('reconnect', onReconnect);
  }

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
