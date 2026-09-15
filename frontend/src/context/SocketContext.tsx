import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { connectSocket, disconnectSocket, ensureSocketConnected } from '../lib/socket';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  reconnect: () => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  reconnect: () => {},
});

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const reconnect = useCallback(() => {
    ensureSocketConnected();
  }, []);

  useEffect(() => {
    if (!token || !user) {
      disconnectSocket();
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const sock = connectSocket(token);
    setSocket(sock);
    setIsConnected(sock.connected);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);

    // Quando o usuário desbloqueia o celular ou volta para o PWA (resumindo da tela de fundo)
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        ensureSocketConnected();
        if (sock.connected) {
          setIsConnected(true);
        }
      }
    };

    const handleOnline = () => {
      ensureSocketConnected();
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleOnline);

    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleOnline);
    };
  }, [token, user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, reconnect }}>
      {children}
    </SocketContext.Provider>
  );
};

export function useSocket() {
  return useContext(SocketContext);
}
