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
import notificationRoutes from './routes/notificationRoutes.js';
import quickMessageRoutes from './routes/quickMessageRoutes.js';
import archiveRoutes from './routes/archiveRoutes.js';
import { archiveService } from './services/archiveService.js';

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
    'ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "mediaData" TEXT',
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
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "Message_waMsgId_idx" ON "Message" ("waMsgId")',
    );
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "QuickMessage" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "shortcut" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "category" TEXT,
        "userId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "QuickMessage" ADD COLUMN IF NOT EXISTS "userId" TEXT;'
    );
    await prisma.$executeRawUnsafe(
      'DROP INDEX IF EXISTS "QuickMessage_shortcut_key";'
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "QuickMessage_shortcut_idx" ON "QuickMessage" ("shortcut")',
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "QuickMessage_title_idx" ON "QuickMessage" ("title")',
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "QuickMessage_userId_idx" ON "QuickMessage" ("userId")',
    );
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MessageArchive" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "conversationId" TEXT NOT NULL,
        "whatsappId" TEXT NOT NULL,
        "driveFileId" TEXT,
        "fileName" TEXT NOT NULL,
        "messageCount" INTEGER NOT NULL DEFAULT 0,
        "firstTimestamp" TIMESTAMP(3),
        "lastTimestamp" TIMESTAMP(3),
        "fileSize" INTEGER NOT NULL DEFAULT 0,
        "syncedToDrive" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MessageArchive_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MessageArchive_conversationId_idx" ON "MessageArchive" ("conversationId")',
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MessageArchive_whatsappId_idx" ON "MessageArchive" ("whatsappId")',
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "MessageArchive_syncedToDrive_idx" ON "MessageArchive" ("syncedToDrive")',
    );

    // Sanitização retroativa de mensagens antigas gravadas com tags cruas
    try {
      await prisma.$executeRawUnsafe(`
        UPDATE "Message" SET content = '🎭 Figurinha' WHERE ("mediaType" = 'sticker' OR type = 'sticker') AND (content = '' OR content IS NULL OR content = '[messageContextInfo]' OR content = '[unknown]');
        UPDATE "Message" SET content = '🔒 [Mensagem protegida por criptografia]' WHERE content = '[secretEncryptedMessage]';
        UPDATE "Message" SET content = '📋 [Mensagem interativa]' WHERE content = '[templateMessage]';
        UPDATE "Message" SET content = 'Mensagem de sistema' WHERE content = '[messageContextInfo]' OR content = '[unknown]';
        UPDATE "Conversation" SET "lastMessage" = '🎭 Figurinha' WHERE "lastMessage" IN ('[sticker]', '[messageContextInfo]', '[unknown]');
        UPDATE "Conversation" SET "lastMessage" = '📷 Imagem' WHERE "lastMessage" = '[image]';
        UPDATE "Conversation" SET "lastMessage" = '🎵 Áudio' WHERE "lastMessage" = '[audio]';
        UPDATE "Conversation" SET "lastMessage" = '🎥 Vídeo' WHERE "lastMessage" = '[video]';
        UPDATE "Conversation" SET "lastMessage" = '📄 Documento' WHERE "lastMessage" = '[document]';
        UPDATE "Conversation" SET "lastMessage" = '📍 Localização' WHERE "lastMessage" = '[location]';
        UPDATE "Conversation" SET "lastMessage" = '👤 Contato' WHERE "lastMessage" = '[contact]';
      `);
    } catch {}

    logger.info('Schema de mensagens e mensagens rápidas verificado (deduplicação, índice waMsgId e QuickMessage ativos).');
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

  // Garante que o diretório de uploads existe
  await fs.mkdir(path.resolve(env.uploadPath), { recursive: true });

  const getMimeType = (file: string): string => {
    const ext = path.extname(file).toLowerCase();
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.zip': 'application/zip',
      '.rar': 'application/vnd.rar',
      '.txt': 'text/plain; charset=utf-8',
      '.csv': 'text/csv; charset=utf-8',
    };
    return map[ext] || 'application/octet-stream';
  };

  // Serve uploads com recuperação sob demanda para mídias do WhatsApp
  app.get('/uploads/:filename', async (req, res) => {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const uploadDir = path.resolve(env.uploadPath);
    const filePath = path.join(uploadDir, safeFilename);

    // 1. Arquivo físico existente em disco
    try {
      await fs.access(filePath);
      const mimeType = getMimeType(filePath);
      res.setHeader('Content-Type', mimeType);
      if (req.query.download === '1') {
        const downloadName = (req.query.name as string) || safeFilename;
        const safeHeader = downloadName.replace(/[^\w\s.-]/gi, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${safeHeader}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
      } else {
        res.setHeader('Content-Disposition', 'inline');
      }
      return res.sendFile(filePath);
    } catch {
      // Continua para recuperação se não estiver no disco
    }

    // 2. Tenta recuperar mídia sob demanda via Baileys / WhatsApp MMS
    try {
      const recovered = await sessionManager.recoverMediaFile(safeFilename);
      if (recovered && recovered.filePath) {
        const mimeType = getMimeType(recovered.filePath);
        res.setHeader('Content-Type', mimeType);
        const downloadName = recovered.originalName || (req.query.name as string) || safeFilename;
        if (req.query.download === '1') {
          const safeHeader = downloadName.replace(/[^\w\s.-]/gi, '_');
          res.setHeader('Content-Disposition', `attachment; filename="${safeHeader}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
        } else {
          res.setHeader('Content-Disposition', 'inline');
        }
        return res.sendFile(recovered.filePath);
      }
    } catch (recErr) {
      logger.warn(`Erro na recuperação sob demanda de mídia (${safeFilename}):`, recErr);
    }

    // 3. Resposta amigável quando o arquivo não existe e não pôde ser recuperado
    return res.status(404).json({
      error: 'Arquivo de mídia não encontrado ou expirado no WhatsApp.',
      code: 'MEDIA_NOT_FOUND',
      filename: safeFilename,
    });
  });

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
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/quick-messages', quickMessageRoutes);
  app.use('/api/archive', archiveRoutes);

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

  // Rotina automática de alívio do banco de dados (Railway Postgres)
  if (env.archiveAutoEnabled) {
    const intervalMs = Math.max(1, env.archiveAutoIntervalHours) * 60 * 60 * 1000;
    // Executa alívio imediato 5 segundos após o boot (garante alívio imediato no deploy do Railway)
    setTimeout(async () => {
      try {
        logger.info('Iniciando alívio imediato inicial do PostgreSQL no Railway...');
        await archiveService.relieveDatabase();
      } catch (e) {
        logger.warn('Erro na rotina de alívio inicial do banco:', e);
      }
    }, 5000);

    // E a cada N horas
    setInterval(async () => {
      try {
        logger.info('Rotina periódica de alívio do PostgreSQL em execução...');
        await archiveService.relieveDatabase();
      } catch (e) {
        logger.warn('Erro na rotina de alívio automático do banco:', e);
      }
    }, intervalMs);
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
