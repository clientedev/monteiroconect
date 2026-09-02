import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { exec } from 'node:child_process';
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

async function ensureMessageColumns(): Promise<void> {
  // O banco do Railway pode ter sido criado antes da inclusão de campos de
  // deduplicação. Essas alterações são aditivas e idempotentes: corrigem uma
  // base existente sem apagar mensagens e deixam o db push completar o resto.
  const statements = [
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "caption" TEXT',
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "quotedMessageId" TEXT',
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "quotedContent" TEXT',
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "senderName" TEXT',
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "senderJid" TEXT',
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "waMsgId" TEXT',
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMP(3)',
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "messageId" TEXT',
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "fromPhone" TEXT',
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "toPhone" TEXT',
    'ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "aiEnabled" BOOLEAN NOT NULL DEFAULT TRUE',
  ];

  try {
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX IF NOT EXISTS "Message_conversationId_waMsgId_key" ON "Message" ("conversationId", "waMsgId")',
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "Message_conversationId_timestamp_idx" ON "Message" ("conversationId", "timestamp")',
    );
    logger.info('Schema de mensagens verificado (deduplicação e timestamp ativos).');
  } catch (err: any) {
    // Em uma base vazia a tabela ainda não existe; o db push abaixo a criará.
    // Outros erros devem interromper o boot para não aceitar mensagens e
    // descartá-las silenciosamente por schema incompatível.
    if (/(?:relation|table).*(?:does not exist|não existe)/i.test(String(err?.message || err))) {
      logger.info('Tabela Message ainda não existe; será criada pelo Prisma.');
      return;
    }
    throw err;
  }
}

async function syncDatabaseInBackground(): Promise<void> {
  logger.info('Sincronizando schema com banco de dados (prisma db push)...');
  await ensureMessageColumns();

  await new Promise<void>((resolve, reject) => {
    const child = exec(
      // Nunca aceite perda de dados automaticamente ao iniciar o servidor.
      // Alterações destrutivas devem ser revisadas e executadas manualmente.
      'npx prisma db push --skip-generate',
      { timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) {
          logger.error(`prisma db push falhou: ${stderr || err.message}`);
          reject(err);
        } else {
          logger.info(`Schema sincronizado: ${stdout?.trim()}`);
          resolve();
        }
      },
    );
    child.stdout?.on('data', (d) => logger.info(`[prisma] ${d.trim()}`));
    child.stderr?.on('data', (d) => logger.warn(`[prisma] ${d.trim()}`));
  });
}

async function bootstrap() {
  logger.info('=== Monteiro Conecta - Iniciando ===');

  // Ensure directories exist
  await fs.mkdir(env.sessionsPath, { recursive: true });
  await fs.mkdir(env.uploadPath, { recursive: true });
  await fs.mkdir(env.logPath, { recursive: true });
  if (env.nodeEnv === 'production' && !process.env.SESSIONS_PATH) {
    logger.warn(
      `SESSIONS_PATH não foi definido; sessões usam ${path.resolve(env.sessionsPath).replace(/\/$/, '')}. ` +
      'No Railway, monte um Volume persistente nesse caminho para não exigir novo QR após reinícios.',
    );
  }

  // Express app
  const app = express();
  const httpServer = createServer(app);

  // Health check — SEMPRE retorna 200 (servidor está rodando = saudável)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
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

  // Start server IMEDIATAMENTE
  httpServer.listen(env.port, () => {
    logger.info(`Servidor HTTP rodando na porta ${env.port}`);
    logger.info(`WebSocket disponível em ws://localhost:${env.port}/ws`);
  });

  // Sincroniza banco em background (não bloqueia o event loop)
  await syncDatabaseInBackground();

  try {
    await prisma.$connect();
    await ensureAdminExists();
    logger.info('Banco de dados pronto');
  } catch (err) {
    logger.error('Falha ao conectar ao banco de dados:', err);
  }

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
