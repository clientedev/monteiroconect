import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { prisma } from '../database/client.js';
import { createLog } from '../services/logService.js';
import { logger } from '../utils/logger.js';
import jwt from 'jsonwebtoken';

export function setupWebSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/ws',
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('Token não fornecido'));
      }
      const decoded = jwt.verify(token, env.jwtSecret) as { id: string; username: string; role: string };
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`WebSocket conectado: ${socket.data.user?.username}`);
    socket.join('app');

    socket.on('disconnect', () => {
      logger.info(`WebSocket desconectado: ${socket.data.user?.username}`);
    });

    // Join room for specific account updates
    socket.on('join-account', (accountId: string) => {
      socket.join(`account:${accountId}`);
    });

    socket.on('leave-account', (accountId: string) => {
      socket.leave(`account:${accountId}`);
    });

    socket.on('join-conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave-conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Cliente marcou conversa como lida — notifica todos para zerar badges
    socket.on('conversation-read', (conversationId: string) => {
      io.emit('conversation:read', { conversationId });
    });
  });

  // Forward session manager events to WebSocket clients
  // FIX 4: Emite eventos por room específica em vez de broadcast global.
  // Com múltiplos WhatsApps, um broadcast para todos os clientes é desnecessário
  // e pode causar atualizações cruzadas entre contas diferentes.

  sessionManager.on('status-change', (data) => {
    io.to(`account:${data.accountId}`).emit('whatsapp:status', data);
    io.to('app').emit('whatsapp:status', data); // admins veem tudo
    createLog(
      data.status === 'CONNECTED' ? 'info' : data.status === 'ERROR' ? 'error' : 'warning',
      `WhatsApp "${data.name}" status: ${data.status}`,
      'whatsapp',
      data.accountId,
    );
  });

  sessionManager.on('qr-code', (data) => {
    io.to(`account:${data.accountId}`).emit('whatsapp:qr', data);
    io.to('app').emit('whatsapp:qr', data);
  });

  sessionManager.on('connected', (data) => {
    io.to(`account:${data.accountId}`).emit('whatsapp:connected', data);
    io.to('app').emit('whatsapp:connected', data);
    createLog('info', `WhatsApp "${data.name}" conectado (${data.phone})`, 'whatsapp', data.accountId);
  });

  sessionManager.on('disconnected', (data) => {
    io.to(`account:${data.accountId}`).emit('whatsapp:disconnected', data);
    io.to('app').emit('whatsapp:disconnected', data);
    createLog('warning', `WhatsApp desconectado: ${data.accountId} (${data.reason})`, 'whatsapp', data.accountId);
  });

  sessionManager.on('message', (data) => {
    // Emite para a room da conta (lista de conversas) e da conversa específica
    io.to(`account:${data.accountId}`).emit('message:new', data);
    io.to(`conversation:${data.conversationId}`).emit('message:new', data);

    prisma.notification.create({
      data: {
        type: 'new_message',
        title: `Nova mensagem de ${data.contact.name || data.contact.phone}`,
        body: data.message.content?.slice(0, 100),
      },
    }).catch(() => {});
  });

  sessionManager.on('message-sent', (data) => {
    io.to(`account:${data.accountId}`).emit('message:sent', data);
    io.to(`conversation:${data.conversationId}`).emit('message:sent', data);
  });

  sessionManager.on('history-imported', (data) => {
    io.to(`account:${data.accountId}`).emit('history:imported', data);
    io.to('app').emit('history:imported', data);
  });

  sessionManager.on('contacts-updated', (data) => {
    io.to(`account:${data.accountId}`).emit('contacts:updated', data);
  });

  sessionManager.on('reconnect-failed', (data) => {
    io.to(`account:${data.accountId}`).emit('whatsapp:reconnect-failed', data);
    io.to('app').emit('whatsapp:reconnect-failed', data);
    createLog('error', `Reconexão falhou: ${data.accountId}`, 'whatsapp', data.accountId);
  });

  return io;
}

export type { Server as IOServer };
