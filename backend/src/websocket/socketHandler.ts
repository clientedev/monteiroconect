import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { prisma } from '../database/client.js';
import { createLog } from '../services/logService.js';
import { sendPushForNewMessage } from '../services/pushNotificationService.js';
import { logger } from '../utils/logger.js';
import jwt from 'jsonwebtoken';


export interface TeamMoodEntry {
  userId: string;
  username: string;
  moodId: string;
  moodLabel: string;
  emoji: string;
  updatedAt: string;
}

const teamMoodsMap = new Map<string, TeamMoodEntry>();

export function getTeamMoods(): TeamMoodEntry[] {
  return Array.from(teamMoodsMap.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

let activeIoInstance: Server | null = null;

export function recordUserMood(mood: TeamMoodEntry, ioServer?: Server) {
  teamMoodsMap.set(mood.userId, mood);
  const server = ioServer || activeIoInstance;
  if (server) {
    server.to('app').emit('team:mood:updated', mood);
  }
}

export function setupWebSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigin.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    path: '/ws',
  });
  activeIoInstance = io;

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

    // Envia lista atual de sentimentos da equipe
    socket.emit('team:mood:init', getTeamMoods());

    // Atualizacao de sentimento do usuario logado
    socket.on('user:mood:update', (data: { moodId: string; moodLabel: string; emoji: string }) => {
      const user = socket.data.user;
      if (!user) return;
      const entry: TeamMoodEntry = {
        userId: String(user.id),
        username: user.username,
        moodId: data.moodId,
        moodLabel: data.moodLabel || data.moodId,
        emoji: data.emoji || '😊',
        updatedAt: new Date().toISOString(),
      };
      recordUserMood(entry, io);
    });


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
  sessionManager.on('status-change', (data) => {
    io.emit('whatsapp:status', data);
    io.to(`account:${data.accountId}`).emit('whatsapp:status', data);
    createLog(
      data.status === 'CONNECTED' ? 'info' : data.status === 'ERROR' ? 'error' : 'warning',
      `WhatsApp "${data.name}" status: ${data.status}`,
      'whatsapp',
      data.accountId,
    );
  });

  sessionManager.on('qr-code', (data) => {
    io.emit('whatsapp:qr', data);
    io.to(`account:${data.accountId}`).emit('whatsapp:qr', data);
  });

  sessionManager.on('connected', (data) => {
    io.emit('whatsapp:connected', data);
    createLog('info', `WhatsApp "${data.name}" conectado (${data.phone})`, 'whatsapp', data.accountId);
  });

  sessionManager.on('disconnected', (data) => {
    io.emit('whatsapp:disconnected', data);
    createLog('warning', `WhatsApp desconectado: ${data.accountId} (${data.reason})`, 'whatsapp', data.accountId);
  });

  sessionManager.on('message', (data) => {
    io.emit('message:new', data);

    prisma.notification.create({
      data: {
        type: 'new_message',
        title: `Nova mensagem de ${data.contact.name || data.contact.phone}`,
        body: data.message.content?.slice(0, 100),
      },
    }).catch(() => {});

    // Notificação Web Push para dispositivos móveis com app fechado
    if (!data.message?.isFromMe) {
      sendPushForNewMessage({
        message: data.message,
        contact: data.contact,
        conversation: data.conversation,
        accountId: data.accountId,
      }).catch((err) => {
        logger.warn(`Erro ao disparar Web Push: ${err?.message || err}`);
      });
    }
  });

  sessionManager.on('message-sent', (data) => {
    io.emit('message:sent', data);
  });

  sessionManager.on('history-imported', (data) => {
    io.emit('history:imported', data);
  });

  sessionManager.on('sync-progress', (data) => {
    io.emit('sync:progress', data);
    io.to(`account:${data.accountId}`).emit('sync:progress', data);
  });

  sessionManager.on('contacts-updated', (data) => {
    io.emit('contacts:updated', data);
  });

  sessionManager.on('reconnect-failed', (data) => {
    io.emit('whatsapp:reconnect-failed', data);
    createLog('error', `Reconexão falhou: ${data.accountId}`, 'whatsapp', data.accountId);
  });

  return io;
}

export type { Server as IOServer };
