import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'node:http';
import path from 'node:path';
import { promises as fs } from 'fs';
import { env } from './config/env.js';
import { prisma } from './database/client.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { setupWebSocket } from './websocket/socketHandler.js';
import { ensureAdminExists } from './services/authService.js';
import { sessionManager } from './whatsapp/sessionManager.js';

import authRoutes from './routes/authRoutes.js';
import whatsappRoutes from './routes/whatsappRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import tagRoutes from './routes/tagRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import logRoutes from './routes/logRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import chatbotRoutes from './routes/chatbotRoutes.js';

async function bootstrap() {
  logger.info('=== Monteiro Conecta - Iniciando ===');

  // Ensure directories exist
  await fs.mkdir(env.sessionsPath, { recursive: true });
  await fs.mkdir(env.uploadPath, { recursive: true });
  await fs.mkdir(env.logPath, { recursive: true });

  // Database
  logger.info('Sincronizando banco de dados...');
  await prisma.$connect();

  // Ensure admin user
  await ensureAdminExists();
  logger.info('Banco de dados pronto');

  // Express app
  const app = express();
  const httpServer = createServer(app);

  // Middleware
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({
    origin: env.corsOrigin.split(','),
    credentials: true,
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Serve uploads
  app.use('/uploads', express.static(path.resolve(env.uploadPath)));

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/contacts', contactRoutes);
  app.use('/api/tags', tagRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/logs', logRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/chatbots', chatbotRoutes);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Error handler
  app.use(errorHandler);

  // WebSocket
  const io = setupWebSocket(httpServer);

  // Start server
  httpServer.listen(env.port, () => {
    logger.info(`Servidor HTTP rodando na porta ${env.port}`);
    logger.info(`WebSocket disponível em ws://localhost:${env.port}/ws`);
  });

  // Initialize WhatsApp sessions
  try {
    await sessionManager.initialize();
  } catch (err) {
    logger.error('Erro ao inicializar sessões WhatsApp:', err);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Recebido ${signal}, encerrando...`);
    io.close();
    await sessionManager.destroy();
    await prisma.$disconnect();
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
  });
  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Rejection:', err);
  });
}

bootstrap().catch((err) => {
  logger.error('Falha fatal ao iniciar:', err);
  process.exit(1);
});
