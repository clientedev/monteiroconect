import './utils/consoleNoise.js';
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
import scheduledMessageRoutes from './routes/scheduledMessageRoutes.js';
import automationRoutes from './routes/automationRoutes.js';
import publicBookingRoutes from './routes/publicBookingRoutes.js';
import { startAutomationWorker } from './services/automationService.js';
import { startScheduledMessageWorker } from './services/scheduledMessageService.js';
import { startMemoryDiagnostics } from './utils/memoryDiagnostics.js';
import { archiveService } from './services/archiveService.js';

const AUTOMATION_DDL = [
  `CREATE TABLE IF NOT EXISTS "Automation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BOOKING',
    "whatsappId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "bookingOpen" BOOLEAN NOT NULL DEFAULT true,
    "calendars" JSONB NOT NULL,
    "targetCalendarId" TEXT,
    "meetingTitle" TEXT NOT NULL DEFAULT 'Revisão de apólice',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 15,
    "daysAhead" INTEGER NOT NULL DEFAULT 14,
    "minNoticeHours" INTEGER NOT NULL DEFAULT 24,
    "slotsInMessage" INTEGER NOT NULL DEFAULT 6,
    "workingHours" JSONB NOT NULL,
    "skipHolidays" BOOLEAN NOT NULL DEFAULT true,
    "messageTemplate" TEXT NOT NULL,
    "confirmationTemplate" TEXT NOT NULL,
    "senderName" TEXT,
    "publicBaseUrl" TEXT,
    "sendWindowStart" TEXT NOT NULL DEFAULT '09:00',
    "sendWindowEnd" TEXT NOT NULL DEFAULT '19:00',
    "lastError" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Automation_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES "WhatsAppAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS "Automation_status_idx" ON "Automation" ("status")',
  `CREATE TABLE IF NOT EXISTS "AutomationRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "automationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationRecipient_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  'CREATE UNIQUE INDEX IF NOT EXISTS "AutomationRecipient_token_key" ON "AutomationRecipient" ("token")',
  'CREATE UNIQUE INDEX IF NOT EXISTS "AutomationRecipient_automationId_phone_key" ON "AutomationRecipient" ("automationId", "phone")',
  'CREATE INDEX IF NOT EXISTS "AutomationRecipient_automationId_status_idx" ON "AutomationRecipient" ("automationId", "status")',
  `CREATE TABLE IF NOT EXISTS "AutomationBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "automationId" TEXT NOT NULL,
    "recipientId" TEXT,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "calendarEventId" TEXT,
    "calendarError" TEXT,
    "canceledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationBooking_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS "AutomationBooking_automationId_startAt_idx" ON "AutomationBooking" ("automationId", "startAt")',
  'CREATE INDEX IF NOT EXISTS "AutomationBooking_recipientId_idx" ON "AutomationBooking" ("recipientId")',
  // Dois clientes nunca ficam com o mesmo horário confirmado (vale entre todas as automações).
  `CREATE UNIQUE INDEX IF NOT EXISTS "AutomationBooking_confirmed_slot_key" ON "AutomationBooking" ("startAt") WHERE "status" = 'CONFIRMED'`,
];

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
    // Mensagens agendadas (mesma estrutura do schema.prisma; aditivo e idempotente)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ScheduledMessage" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "whatsappId" TEXT NOT NULL,
        "toPhone" TEXT NOT NULL,
        "contactName" TEXT,
        "content" TEXT NOT NULL,
        "senderName" TEXT,
        "scheduledAt" TIMESTAMP(3) NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "lastError" TEXT,
        "sentAt" TIMESTAMP(3),
        "createdById" TEXT,
        "createdByName" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ScheduledMessage_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES "WhatsAppAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "ScheduledMessage_status_scheduledAt_idx" ON "ScheduledMessage" ("status", "scheduledAt")',
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "ScheduledMessage_whatsappId_idx" ON "ScheduledMessage" ("whatsappId")',
    );
    // Automações de agendamento (mesma estrutura do schema.prisma; aditivo e idempotente)
    for (const statement of AUTOMATION_DDL) {
      await prisma.$executeRawUnsafe(statement);
    }

    // Sanitização retroativa em background (não bloqueia o boot).
    // Um comando por chamada: o Postgres não aceita vários comandos num único prepared statement
    // (antes o bloco inteiro falhava silenciosamente em todo boot).
    setTimeout(async () => {
      const sanitizeStatements = [
        `UPDATE "Message" SET content = '🎭 Figurinha' WHERE ("mediaType" = 'sticker' OR type = 'sticker') AND (content = '' OR content IS NULL OR content = '[messageContextInfo]' OR content = '[unknown]')`,
        `UPDATE "Message" SET content = '🔒 [Mensagem protegida por criptografia]' WHERE content = '[secretEncryptedMessage]'`,
        `UPDATE "Message" SET content = '📋 [Mensagem interativa]' WHERE content = '[templateMessage]'`,
        `UPDATE "Message" SET content = 'Mensagem de sistema' WHERE content = '[messageContextInfo]' OR content = '[unknown]'`,
        `UPDATE "Conversation" SET "lastMessage" = '🎭 Figurinha' WHERE "lastMessage" IN ('[sticker]', '[messageContextInfo]', '[unknown]')`,
        `UPDATE "Conversation" SET "lastMessage" = '📷 Imagem' WHERE "lastMessage" = '[image]'`,
        `UPDATE "Conversation" SET "lastMessage" = '🎵 Áudio' WHERE "lastMessage" = '[audio]'`,
        `UPDATE "Conversation" SET "lastMessage" = '🎥 Vídeo' WHERE "lastMessage" = '[video]'`,
        `UPDATE "Conversation" SET "lastMessage" = '📄 Documento' WHERE "lastMessage" = '[document]'`,
        `UPDATE "Conversation" SET "lastMessage" = '📍 Localização' WHERE "lastMessage" = '[location]'`,
        `UPDATE "Conversation" SET "lastMessage" = '👤 Contato' WHERE "lastMessage" = '[contact]'`,
      ];
      for (const statement of sanitizeStatements) {
        try {
          await prisma.$executeRawUnsafe(statement);
        } catch (sanitizeErr) {
          logger.warn('Aviso na sanitização retroativa de mensagens:', sanitizeErr);
        }
      }
    }, 15000);

    // Recuperação automática de mensagens para conversas esvaziadas por limpezas anteriores
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Message" ("id", "conversationId", "whatsappId", "type", "content", "isFromMe", "isRead", "timestamp", "createdAt", "toPhone")
        SELECT 
          'restored_' || c.id, 
          c.id, 
          c."whatsappId", 
          'text', 
          c."lastMessage", 
          false, 
          true, 
          COALESCE(c."lastMessageAt", c."updatedAt", NOW()), 
          COALESCE(c."lastMessageAt", c."updatedAt", NOW()),
          COALESCE(ct."phone", '')
        FROM "Conversation" c
        JOIN "Contact" ct ON ct.id = c."contactId"
        WHERE c."lastMessage" IS NOT NULL 
          AND c."lastMessage" != ''
          AND NOT EXISTS (
            SELECT 1 FROM "Message" m WHERE m."conversationId" = c.id
          )
        ON CONFLICT DO NOTHING;
      `);
      logger.info('Auto-reparo de mensagens em conversas executado com sucesso.');
    } catch (restoreErr) {
      logger.warn('Aviso no auto-reparo de mensagens:', restoreErr);
    }

    // Limpeza de chaves de auth órfãs do Baileys para aliviar espaço no PostgreSQL
    try {
      await prisma.$executeRawUnsafe(`
        DELETE FROM "BaileysAuthState" 
        WHERE "whatsappId" NOT IN (SELECT id FROM "WhatsAppAccount");
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

  await new Promise<void>((resolve) => {
    const child = exec(
      // Nunca aceite perda de dados automaticamente ao iniciar o servidor.
      // Alterações destrutivas devem ser revisadas e executadas manualmente.
      'npx prisma db push --skip-generate',
      { timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) {
          logger.warn(`prisma db push não pôde sincronizar automaticamente (schema mantido): ${stderr || err.message}`);
          // Resolvemos para não interromper rotinas subsequentes (ensureMessageColumns já garantiu as tabelas necessárias)
          resolve();
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
  app.use('/api/scheduled-messages', scheduledMessageRoutes);
  app.use('/api/automations', automationRoutes);
  app.use('/api/public/agendamento', publicBookingRoutes);

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

  // Sincroniza schema em background (não bloqueia healthcheck do Railway)
  syncDatabaseInBackground()
    .then(() => {
      logger.info('Sincronização de schema em background concluída com sucesso.');
    })
    .catch((err) => {
      logger.warn('Aviso na sincronização do schema em background:', err);
    });

  // Agendador de mensagens e retrato periódico do consumo de memória
  startScheduledMessageWorker();
  startAutomationWorker();
  startMemoryDiagnostics();

  // Rotina periódica de alívio do banco de dados (Railway Postgres)
  if (env.archiveAutoEnabled) {
    const intervalMs = Math.max(1, env.archiveAutoIntervalHours) * 60 * 60 * 1000;
    
    // Execução inicial 3 minutos após inicialização para manter o banco sempre leve
    setTimeout(async () => {
      try {
        logger.info('Executando alívio inicial de manutenção do PostgreSQL...');
        await archiveService.cleanOldMessages({ retentionDays: 5, preserveRecentPerConv: 5, logRetentionDays: 3, vacuumMode: 'light' });
      } catch (bootCleanErr) {
        logger.warn('Aviso no alívio inicial do PostgreSQL:', bootCleanErr);
      }
    }, 180_000);

    setInterval(async () => {
      try {
        logger.info('Rotina periódica de alívio do PostgreSQL em execução...');
        await archiveService.relieveDatabase({ vacuumMode: 'light' });
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
