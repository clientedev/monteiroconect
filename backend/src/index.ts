import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
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

let dbReady = false;
let dbError: string | null = null;

async function syncDatabase() {
  try {
    logger.info('Sincronizando schema com banco de dados (prisma db push)...');
    execSync('npx prisma db push --skip-generate --accept-data-loss 2>&1', {
      stdio: 'pipe',
      timeout: 120_000,
    });
    dbReady = true;
    dbError = null;
    logger.info('Schema sincronizado com sucesso');
  } catch (err: any) {
    dbError = err?.message || String(err);
    logger.error(`Falha ao sincronizar schema: ${dbError}`);
    // Tenta conectar mesmo assim — tabelas podem já existir
    try {
      await prisma.$connect();
      dbReady = true;
      dbError = null;
      logger.info('Conexão com banco estabelecida (schema pode já estar atualizado)');
    } catch {
      logger.error('Banco de dados indisponível');
    }
  }
}

async function bootstrap() {
  logger.info('=== Monteiro Conecta - Iniciando ===');

  // Ensure directories exist
  await fs.mkdir(env.sessionsPath, { recursive: true });
  await fs.mkdir(env.uploadPath, { recursive: true });
  await fs.mkdir(env.logPath, { recursive: true });

  // Express app (inicia ANTES do DB para healthcheck funcionar)
  const app = express();
  const httpServer = createServer(app);

  // Health check — responde imediatamente mesmo sem DB
  app.get('/api/health', async (_req, res) => {
    if (dbReady) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', uptime: process.uptime(), db: 'connected' });
      } catch {
        res.status(503).json({ status: 'degrading', uptime: process.uptime(), db: 'disconnected' });
      }
    } else {
      res.status(503).json({ status: 'starting', uptime: process.uptime(), db: dbError || 'syncing' });
    }
  });

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

  // Serve frontend buildado (produção — mesma origem, sem CORS)
  const frontendDist = path.resolve(process.cwd(), '../frontend/dist');
  try {
    await fs.access(frontendDist);
    app.use(express.static(frontendDist));
    app.get(/^(?!\/api|\/uploads|\/ws).*/, (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
    logger.info(`Frontend servido de ${frontendDist}`);
  } catch {
    logger.info('Frontend dist não encontrado — modo API apenas');
  }

  // Error handler
  app.use(errorHandler);

  // WebSocket
  const io = setupWebSocket(httpServer);

  // Start server IMEDIATAMENTE (antes do DB)
  httpServer.listen(env.port, () => {
    logger.info(`Servidor HTTP rodando na porta ${env.port}`);
    logger.info(`WebSocket disponível em ws://localhost:${env.port}/ws`);
  });

  // Sincroniza banco EM PARALELO — healthcheck já responde
  await syncDatabase();

  if (dbReady) {
    await prisma.$connect();
    await ensureAdminExists();
    logger.info('Banco de dados pronto');
  }

  // Initialize WhatsApp sessions
  if (dbReady) {
    try {
      await sessionManager.initialize();
    } catch (err) {
      logger.error('Erro ao inicializar sessões WhatsApp:', err);
    }
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
