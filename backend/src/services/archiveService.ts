import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { googleDriveService } from './googleDriveService.js';

interface CachedArchive {
  messages: any[];
  loadedAt: number;
}

class ArchiveService {
  private localDir: string;
  private memoryCache = new Map<string, CachedArchive>();
  private maxMemoryCacheEntries = 100;
  private isRelieving = false;
  private relievingStartedAt = 0;

  constructor() {
    this.localDir = path.resolve(env.archiveLocalPath);
    if (!fs.existsSync(this.localDir)) {
      try {
        fs.mkdirSync(this.localDir, { recursive: true });
      } catch (err) {
        logger.error('Erro ao criar diretório de cache de arquivo:', err);
      }
    }
  }

  /**
   * Arquiva mensagens antigas de uma conversa específica mantendo as N mais recentes no Postgres
   */
  public async archiveConversation(
    conversationId: string,
    keepCount: number = env.archiveKeepMessagesPerConv,
  ): Promise<{ conversationId: string; archivedCount: number; driveFileId?: string } | null> {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, whatsappId: true },
      });
      if (!conv) return null;

      const totalCount = await prisma.message.count({
        where: { conversationId },
      });

      if (totalCount <= keepCount) {
        return null;
      }

      // Identifica os IDs das mensagens mais recentes a manter
      const messagesToKeep = await prisma.message.findMany({
        where: { conversationId },
        orderBy: [
          { timestamp: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: keepCount,
        select: { id: true },
      });

      const keepIds = new Set(messagesToKeep.map(m => m.id));

      // Busca todas as mensagens que serão arquivadas
      const messagesToArchive = await prisma.message.findMany({
        where: {
          conversationId,
          id: { notIn: Array.from(keepIds) },
        },
        orderBy: [
          { timestamp: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      });

      if (messagesToArchive.length === 0) return null;

      const now = Date.now();
      const fileName = `archive_${conversationId}_${now}.json.gz`;
      const localFilePath = path.join(this.localDir, fileName);

      const payload = {
        version: 1,
        conversationId,
        whatsappId: conv.whatsappId,
        archivedAt: new Date().toISOString(),
        messageCount: messagesToArchive.length,
        firstTimestamp: messagesToArchive[0]?.timestamp || messagesToArchive[0]?.createdAt,
        lastTimestamp: messagesToArchive[messagesToArchive.length - 1]?.timestamp || messagesToArchive[messagesToArchive.length - 1]?.createdAt,
        messages: messagesToArchive,
      };

      const jsonStr = JSON.stringify(payload);
      const compressedBuffer = zlib.gzipSync(Buffer.from(jsonStr, 'utf-8'), { level: 9 });

      // Salva em cache local primeiro
      fs.writeFileSync(localFilePath, compressedBuffer);

      // Upload para Google Drive se configurado
      let driveFileId: string | null = null;
      let syncedToDrive = false;

      if (googleDriveService.isConfigured()) {
        try {
          const uploadRes = await googleDriveService.uploadFile({
            name: fileName,
            mimeType: 'application/gzip',
            content: compressedBuffer,
          });
          if (uploadRes) {
            driveFileId = uploadRes.fileId;
            syncedToDrive = true;
          }
        } catch (uploadErr) {
          logger.warn(`Falha ao enviar backup da conversa ${conversationId} para o Drive. Mantido localmente:`, uploadErr);
        }
      }

      // Registra no índice de arquivos e remove do Postgres
      const archiveRecord = await prisma.$transaction(async (tx) => {
        const created = await tx.messageArchive.create({
          data: {
            conversationId,
            whatsappId: conv.whatsappId,
            driveFileId,
            fileName,
            messageCount: messagesToArchive.length,
            firstTimestamp: payload.firstTimestamp ? new Date(payload.firstTimestamp) : null,
            lastTimestamp: payload.lastTimestamp ? new Date(payload.lastTimestamp) : null,
            fileSize: compressedBuffer.length,
            syncedToDrive,
          },
        });

        // Remove do Postgres para aliviar o banco
        await tx.message.deleteMany({
          where: {
            id: { in: messagesToArchive.map(m => m.id) },
          },
        });

        return created;
      });

      // Salva na memória cache rápida
      this.cacheInMemory(archiveRecord.id, messagesToArchive);

      logger.info(`Conversa ${conversationId}: ${messagesToArchive.length} mensagens arquivadas com sucesso (liberados ~${(compressedBuffer.length / 1024).toFixed(1)} KB compactados). Drive: ${syncedToDrive ? 'OK' : 'Pendente'}`);

      return {
        conversationId,
        archivedCount: messagesToArchive.length,
        driveFileId: driveFileId || undefined,
      };
    } catch (err: any) {
      logger.error(`Erro ao arquivar conversa ${conversationId}:`, err?.message || err);
      throw err;
    }
  }

  /**
   * Arquiva mensagens de uma conversa com mais de N dias (cutoffDate),
   * preservando intactas todas as mensagens recentes (<= cutoffDate) no Postgres.
   * Opcionalmente mantém um mínimo de segurança (ex: 1 mensagem) para garantir
   * que a conversa mantenha preview imediato no card mesmo se inativa.
   */
  public async archiveConversationOlderThanDate(
    conversationId: string,
    cutoffDate: Date,
    keepRecentMin: number = 1,
  ): Promise<{
    conversationId: string;
    archivedCount: number;
    driveFileId?: string;
    syncedToDrive?: boolean;
    uploadError?: string;
  } | null> {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, whatsappId: true },
      });
      if (!conv) return null;

      // Se keepRecentMin > 0, identificamos as N mensagens mais recentes da conversa para NUNCA apagá-las
      let protectedIds = new Set<string>();
      if (keepRecentMin > 0) {
        const recentOnes = await prisma.message.findMany({
          where: { conversationId },
          orderBy: [
            { timestamp: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
            { id: 'desc' },
          ],
          take: keepRecentMin,
          select: { id: true },
        });
        protectedIds = new Set(recentOnes.map(m => m.id));
      }

      // Busca mensagens elegíveis (mais antigas que o cutoffDate e não protegidas)
      const messagesToArchive = await prisma.message.findMany({
        where: {
          conversationId,
          id: { notIn: Array.from(protectedIds) },
          OR: [
            { timestamp: { lt: cutoffDate } },
            { timestamp: null, createdAt: { lt: cutoffDate } },
          ],
        },
        orderBy: [
          { timestamp: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
          { id: 'asc' },
        ],
      });

      if (messagesToArchive.length === 0) return null;

      const now = Date.now();
      const fileName = `archive_${conversationId}_cutoff_${now}.json.gz`;
      const localFilePath = path.join(this.localDir, fileName);

      const payload = {
        version: 1,
        conversationId,
        whatsappId: conv.whatsappId,
        archivedAt: new Date().toISOString(),
        cutoffDate: cutoffDate.toISOString(),
        messageCount: messagesToArchive.length,
        firstTimestamp: messagesToArchive[0]?.timestamp || messagesToArchive[0]?.createdAt,
        lastTimestamp: messagesToArchive[messagesToArchive.length - 1]?.timestamp || messagesToArchive[messagesToArchive.length - 1]?.createdAt,
        messages: messagesToArchive,
      };

      const jsonStr = JSON.stringify(payload);
      const compressedBuffer = zlib.gzipSync(Buffer.from(jsonStr, 'utf-8'), { level: 9 });

      // Salva em cache local primeiro
      fs.writeFileSync(localFilePath, compressedBuffer);

      // Upload para Google Drive se configurado
      let driveFileId: string | null = null;
      let syncedToDrive = false;
      let uploadError: string | undefined;

      if (googleDriveService.isConfigured()) {
        try {
          const uploadRes = await googleDriveService.uploadFile({
            name: fileName,
            mimeType: 'application/gzip',
            content: compressedBuffer,
          });
          if (uploadRes) {
            driveFileId = uploadRes.fileId;
            syncedToDrive = true;
          }
        } catch (uploadErr: any) {
          uploadError = uploadErr?.message || String(uploadErr);
          logger.warn(`Falha ao enviar backup da conversa ${conversationId} para o Drive. Mantido localmente:`, uploadError);
        }
      } else {
        uploadError = googleDriveService.getInitError() || 'Google Drive não configurado no Railway';
      }

      // Registra no índice de arquivos e remove do Postgres
      const archiveRecord = await prisma.$transaction(async (tx) => {
        const created = await tx.messageArchive.create({
          data: {
            conversationId,
            whatsappId: conv.whatsappId,
            driveFileId,
            fileName,
            messageCount: messagesToArchive.length,
            firstTimestamp: payload.firstTimestamp ? new Date(payload.firstTimestamp) : null,
            lastTimestamp: payload.lastTimestamp ? new Date(payload.lastTimestamp) : null,
            fileSize: compressedBuffer.length,
            syncedToDrive,
          },
        });

        // Remove do Postgres para aliviar o banco
        await tx.message.deleteMany({
          where: {
            id: { in: messagesToArchive.map(m => m.id) },
          },
        });

        return created;
      });

      // Salva na memória cache rápida
      this.cacheInMemory(archiveRecord.id, messagesToArchive);

      logger.info(`Conversa ${conversationId}: ${messagesToArchive.length} mensagens antigas arquivadas (liberados ~${(compressedBuffer.length / 1024).toFixed(1)} KB compactados). Drive: ${syncedToDrive ? 'OK' : 'Pendente'}`);

      return {
        conversationId,
        archivedCount: messagesToArchive.length,
        driveFileId: driveFileId || undefined,
        syncedToDrive,
        uploadError,
      };
    } catch (err: any) {
      logger.error(`Erro ao arquivar mensagens antigas da conversa ${conversationId}:`, err?.message || err);
      throw err;
    }
  }

  /**
   * Recupera mensagens arquivadas de uma conversa (com cache de memória e disco)
   */
  public async getArchivedMessages(conversationId: string): Promise<any[]> {
    try {
      const archives = await prisma.messageArchive.findMany({
        where: { conversationId },
        orderBy: [
          { firstTimestamp: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      });

      if (archives.length === 0) return [];

      const allArchivedMessages: any[] = [];

      for (const arch of archives) {
        // 1. Memória
        const inMem = this.memoryCache.get(arch.id);
        if (inMem) {
          allArchivedMessages.push(...inMem.messages);
          continue;
        }

        // 2. Disco local
        const localPath = path.join(this.localDir, arch.fileName);
        let buffer: Buffer | null = null;

        if (fs.existsSync(localPath)) {
          buffer = fs.readFileSync(localPath);
        } else if (arch.driveFileId && googleDriveService.isConfigured()) {
          // 3. Download sob demanda do Google Drive
          logger.info(`Recuperando arquivo de mensagens do Google Drive: ${arch.fileName} (${arch.driveFileId})`);
          try {
            buffer = await googleDriveService.downloadFile(arch.driveFileId);
            // Salva de volta no disco para próximas leituras instantâneas
            fs.writeFileSync(localPath, buffer);
          } catch (dlErr) {
            logger.error(`Erro ao baixar arquivo ${arch.fileName} do Google Drive:`, dlErr);
          }
        }

        if (buffer) {
          try {
            const decompressed = zlib.gunzipSync(buffer);
            const data = JSON.parse(decompressed.toString('utf-8'));
            const msgs = data.messages || [];
            this.cacheInMemory(arch.id, msgs);
            allArchivedMessages.push(...msgs);
          } catch (pErr) {
            logger.error(`Erro ao descompactar/ler arquivo ${arch.fileName}:`, pErr);
          }
        }
      }

      // Ordena as mensagens arquivadas de forma cronológica decrescente para facilitar merge
      allArchivedMessages.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.createdAt).getTime();
        const timeB = new Date(b.timestamp || b.createdAt).getTime();
        return timeB - timeA;
      });

      return allArchivedMessages;
    } catch (err) {
      logger.error(`Erro ao recuperar mensagens arquivadas da conversa ${conversationId}:`, err);
      return [];
    }
  }

  /**
   * Sincroniza arquivos locais pendentes para o Google Drive
   */
  public async syncPendingToDrive(): Promise<number> {
    if (!googleDriveService.isConfigured()) return 0;

    const pendings = await prisma.messageArchive.findMany({
      where: { syncedToDrive: false },
      take: 50,
    });

    let synced = 0;
    for (const p of pendings) {
      const localPath = path.join(this.localDir, p.fileName);
      if (!fs.existsSync(localPath)) continue;

      try {
        const buffer = fs.readFileSync(localPath);
        const res = await googleDriveService.uploadFile({
          name: p.fileName,
          mimeType: 'application/gzip',
          content: buffer,
        });

        if (res) {
          await prisma.messageArchive.update({
            where: { id: p.id },
            data: {
              driveFileId: res.fileId,
              syncedToDrive: true,
            },
          });
          synced++;
        }
      } catch (err) {
        logger.warn(`Falha na sincronização pendente do arquivo ${p.fileName}:`, err);
      }
    }

    return synced;
  }

  /**
   * Executa a rotina completa de backup para Google Drive e alívio do PostgreSQL,
   * preservando intactos os dados dos últimos N dias (padrão 5 dias).
   */
  public async relieveDatabase(opts?: {
    retentionDays?: number;
    keepCount?: number;
    logRetentionDays?: number;
    preserveRecentPerConv?: number;
  }): Promise<{
    success: boolean;
    retentionDays: number;
    cutoffDate: string;
    archivedConversations: number;
    archivedMessages: number;
    purgedLogs: number;
    purgedNotifications: number;
    syncedToDrive: number;
    driveConfigured: boolean;
    driveStatus?: any;
    error?: string;
  }> {
    const retentionDays = opts?.retentionDays ?? 5;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Se o processo estiver travado há mais de 2 minutos, reseta automaticamente
    if (this.isRelieving && (Date.now() - this.relievingStartedAt > 120000)) {
      logger.warn('Lock de backup/alívio anterior expirou (> 2min). Destravando automaticamente...');
      this.isRelieving = false;
      this.relievingStartedAt = 0;
    }

    if (this.isRelieving) {
      return {
        success: false,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        archivedConversations: 0,
        archivedMessages: 0,
        purgedLogs: 0,
        purgedNotifications: 0,
        syncedToDrive: 0,
        driveConfigured: googleDriveService.isConfigured(),
        driveStatus: await googleDriveService.testConnection(),
        error: 'Uma rotina de backup e alívio do banco de dados já está em execução. Você pode clicar em "Destravar Processo" para liberá-la imediatamente.',
      };
    }

    this.isRelieving = true;
    this.relievingStartedAt = Date.now();
    const logRetentionDays = opts?.logRetentionDays ?? retentionDays;
    const preserveRecentPerConv = opts?.preserveRecentPerConv ?? 1;

    let archivedConversations = 0;
    let archivedMessages = 0;
    let purgedLogs = 0;
    let purgedNotifications = 0;
    let syncedToDrive = 0;
    const driveUploadErrors: string[] = [];

    try {
      logger.info(`Iniciando backup para Google Drive & alívio do Postgres (Preservando dados de ${retentionDays} dias, cutoff: ${cutoffDate.toISOString()})...`);

      // 1. Purga logs antigos do sistema (> retentionDays)
      try {
        const logCutoff = new Date(Date.now() - logRetentionDays * 24 * 60 * 60 * 1000);
        const logRes = await prisma.systemLog.deleteMany({
          where: { createdAt: { lt: logCutoff } },
        });
        purgedLogs = logRes.count;
        if (purgedLogs > 0) {
          logger.info(`Limpeza de logs do sistema: ${purgedLogs} registros purgados (>${logRetentionDays} dias)`);
        }
      } catch (logErr) {
        logger.warn('Aviso ao purgar logs antigos:', logErr);
      }

      // 2. Purga notificações lidas antigas (> retentionDays)
      try {
        const notifRes = await prisma.notification.deleteMany({
          where: {
            OR: [
              { isRead: true, createdAt: { lt: cutoffDate } },
              { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
            ],
          },
        });
        purgedNotifications = notifRes.count;
      } catch (notifErr) {
        logger.warn('Aviso ao purgar notificações antigas:', notifErr);
      }

      // 2.1. Purga chaves temporárias antigas do Baileys (> retentionDays), mantendo 'creds'
      try {
        const baileysRes = await prisma.baileysAuthState.deleteMany({
          where: {
            dataId: { not: 'creds' },
            updatedAt: { lt: cutoffDate },
          },
        });
        if (baileysRes.count > 0) {
          logger.info(`Limpeza de chaves de sincronização do Baileys: ${baileysRes.count} purgadas.`);
        }
      } catch (bErr) {
        logger.warn('Aviso na limpeza do BaileysAuthState:', bErr);
      }

      // 3. Localiza conversas que possuem mensagens elegíveis (mais de retentionDays dias)
      const conversationsWithOldMessages = await prisma.conversation.findMany({
        where: {
          messages: {
            some: {
              OR: [
                { timestamp: { lt: cutoffDate } },
                { timestamp: null, createdAt: { lt: cutoffDate } },
              ],
            },
          },
        },
        select: {
          id: true,
          whatsappId: true,
        },
      });

      logger.info(`Conversas com dados a arquivar (> ${retentionDays} dias): ${conversationsWithOldMessages.length}`);

      for (const c of conversationsWithOldMessages) {
        try {
          const res = await this.archiveConversationOlderThanDate(c.id, cutoffDate, preserveRecentPerConv);
          if (res && res.archivedCount > 0) {
            archivedConversations++;
            archivedMessages += res.archivedCount;
            if (res.uploadError) {
              driveUploadErrors.push(res.uploadError);
            }
          }
        } catch (convErr: any) {
          logger.error(`Erro ao arquivar mensagens da conversa ${c.id}:`, convErr);
          driveUploadErrors.push(convErr?.message || String(convErr));
        }
      }

      // 3.1. Se foi especificado keepCount (ex: limite de mensagens por conversa ativa)
      if (opts?.keepCount && opts.keepCount > 0) {
        const keepCount = opts.keepCount;
        const heavyConvs = await prisma.conversation.findMany({
          select: { id: true, _count: { select: { messages: true } } },
          where: { messages: { some: {} } },
        });

        for (const hc of heavyConvs) {
          if (hc._count.messages > keepCount) {
            try {
              const res = await this.archiveConversation(hc.id, keepCount);
              if (res && res.archivedCount > 0) {
                archivedConversations++;
                archivedMessages += res.archivedCount;
              }
            } catch (heavyErr) {
              logger.error(`Erro ao aliviar conversa pesada ${hc.id}:`, heavyErr);
            }
          }
        }
      }

      // 4. Cria arquivo consolidado de metadados no Google Drive
      if (googleDriveService.isConfigured()) {
        try {
          const [totalContacts, totalTags, totalConvs, totalActiveMessages] = await Promise.all([
            prisma.contact.count(),
            prisma.tag.count(),
            prisma.conversation.count(),
            prisma.message.count(),
          ]);

          const summaryData = {
            version: 1,
            backupDate: new Date().toISOString(),
            retentionDays,
            cutoffDate: cutoffDate.toISOString(),
            stats: {
              totalContacts,
              totalTags,
              totalConversations: totalConvs,
              totalActiveMessagesInPostgres: totalActiveMessages,
              archivedConversationsThisRun: archivedConversations,
              archivedMessagesThisRun: archivedMessages,
              purgedLogsThisRun: purgedLogs,
            },
          };

          const summaryGzip = zlib.gzipSync(Buffer.from(JSON.stringify(summaryData, null, 2), 'utf-8'), { level: 9 });
          await googleDriveService.uploadFile({
            name: `backup_system_metadata_${Date.now()}.json.gz`,
            mimeType: 'application/gzip',
            content: summaryGzip,
          });
        } catch (sumErr: any) {
          logger.warn('Aviso ao salvar arquivo resumo de metadados no Drive:', sumErr);
          driveUploadErrors.push(`Metadados Drive: ${sumErr?.message || sumErr}`);
        }
      }

      // 5. Sincroniza quaisquer arquivos pendentes com o Google Drive
      syncedToDrive = await this.syncPendingToDrive();

      // 6. Status da conexão com Google Drive
      const driveTest = await googleDriveService.testConnection();

      logger.info(`Backup para Drive & Alívio concluído: ${archivedMessages} mensagens arquivadas em ${archivedConversations} conversas, ${purgedLogs} logs purgados. Dados dos últimos ${retentionDays} dias mantidos no Postgres.`);

      let generalError: string | undefined;
      if (!googleDriveService.isConfigured()) {
        generalError = `Aviso: Google Drive não está configurado no Railway (${googleDriveService.getInitError() || 'GOOGLE_SERVICE_ACCOUNT_JSON ausente'}). Os arquivos foram compactados no servidor local, mas NÃO entraram no Drive.`;
      } else if (!driveTest.success) {
        generalError = `Atenção no Google Drive: ${driveTest.error}`;
      } else if (driveUploadErrors.length > 0) {
        generalError = `Aviso no envio de arquivos ao Drive: ${driveUploadErrors[0]}`;
      }

      return {
        success: true,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        archivedConversations,
        archivedMessages,
        purgedLogs,
        purgedNotifications,
        syncedToDrive,
        driveConfigured: googleDriveService.isConfigured(),
        driveStatus: driveTest,
        error: generalError,
      };
    } catch (err: any) {
      logger.error('Erro geral durante rotina de backup/alívio do PostgreSQL:', err);
      return {
        success: false,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        archivedConversations,
        archivedMessages,
        purgedLogs,
        purgedNotifications,
        syncedToDrive,
        driveConfigured: googleDriveService.isConfigured(),
        driveStatus: await googleDriveService.testConnection(),
        error: err?.message || String(err),
      };
    } finally {
      this.isRelieving = false;
      this.relievingStartedAt = 0;
    }
  }

  /**
   * Reseta o lock de execução caso tenha ficado preso
   */
  public resetLock(): { success: boolean; message: string } {
    this.isRelieving = false;
    this.relievingStartedAt = 0;
    logger.info('Lock de alívio do banco de dados resetado manualmente.');
    return { success: true, message: 'Rotina de backup destravada com sucesso. Você já pode executar o backup.' };
  }

  /**
   * Retorna estatísticas de arquivamento para o sistema
   */
  public async getArchiveStats() {
    try {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      const [
        totalArchives,
        totalArchivedCount,
        unsyncedCount,
        activeMessagesInDb,
        eligibleForArchive,
        driveTest,
      ] = await Promise.all([
        prisma.messageArchive.count(),
        prisma.messageArchive.aggregate({
          _sum: { messageCount: true, fileSize: true },
        }),
        prisma.messageArchive.count({ where: { syncedToDrive: false } }),
        prisma.message.count(),
        prisma.message.count({
          where: {
            OR: [
              { timestamp: { lt: fiveDaysAgo } },
              { timestamp: null, createdAt: { lt: fiveDaysAgo } },
            ],
          },
        }),
        googleDriveService.testConnection(),
      ]);

      const totalArchivedMessages = totalArchivedCount._sum.messageCount || 0;
      const totalCompressedBytes = totalArchivedCount._sum.fileSize || 0;
      const recentMessagesRetained = Math.max(0, activeMessagesInDb - eligibleForArchive);

      return {
        totalArchives,
        totalArchivedMessages,
        totalCompressedBytes,
        unsyncedArchives: unsyncedCount,
        activeMessagesInDb,
        eligibleForArchive,
        recentMessagesRetained,
        retentionDaysDefault: 5,
        driveConfigured: googleDriveService.isConfigured(),
        driveAccountEmail: googleDriveService.getAccountEmail(),
        driveStatus: driveTest,
        keepLimitPerConv: env.archiveKeepMessagesPerConv,
      };
    } catch (err) {
      logger.warn('Aviso ao consultar estatísticas de arquivo:', err);
      const driveTest = await googleDriveService.testConnection();
      return {
        totalArchives: 0,
        totalArchivedMessages: 0,
        totalCompressedBytes: 0,
        unsyncedArchives: 0,
        activeMessagesInDb: 0,
        eligibleForArchive: 0,
        recentMessagesRetained: 0,
        retentionDaysDefault: 5,
        driveConfigured: googleDriveService.isConfigured(),
        driveAccountEmail: googleDriveService.getAccountEmail(),
        driveStatus: driveTest,
        keepLimitPerConv: env.archiveKeepMessagesPerConv,
      };
    }
  }

  private cacheInMemory(archiveId: string, messages: any[]) {
    if (this.memoryCache.size >= this.maxMemoryCacheEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }
    this.memoryCache.set(archiveId, {
      messages,
      loadedAt: Date.now(),
    });
  }
}

export const archiveService = new ArchiveService();
