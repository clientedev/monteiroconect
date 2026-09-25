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
   * Executa a rotina completa de alívio do PostgreSQL no Railway
   */
  public async relieveDatabase(opts?: {
    keepCount?: number;
    logRetentionDays?: number;
  }): Promise<{
    success: boolean;
    archivedConversations: number;
    archivedMessages: number;
    purgedLogs: number;
    purgedNotifications: number;
    syncedToDrive: number;
    driveConfigured: boolean;
    driveStatus?: any;
    error?: string;
  }> {
    if (this.isRelieving) {
      return {
        success: false,
        archivedConversations: 0,
        archivedMessages: 0,
        purgedLogs: 0,
        purgedNotifications: 0,
        syncedToDrive: 0,
        driveConfigured: googleDriveService.isConfigured(),
        error: 'Uma rotina de alívio do banco de dados já está em execução.',
      };
    }

    this.isRelieving = true;
    const keepCount = opts?.keepCount ?? env.archiveKeepMessagesPerConv;
    const logRetentionDays = opts?.logRetentionDays ?? env.archiveLogRetentionDays;

    let archivedConversations = 0;
    let archivedMessages = 0;
    let purgedLogs = 0;
    let purgedNotifications = 0;
    let syncedToDrive = 0;

    try {
      logger.info(`Iniciando rotina de alívio do banco de dados (Limite: ${keepCount} msgs/conversa)...`);

      // 1. Purga logs antigos do sistema
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

      // 2. Purga notificações lidas antigas
      try {
        const notifCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const notifRes = await prisma.notification.deleteMany({
          where: {
            OR: [
              { isRead: true, createdAt: { lt: notifCutoff } },
              { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
            ],
          },
        });
        purgedNotifications = notifRes.count;
      } catch (notifErr) {
        logger.warn('Aviso ao purgar notificações antigas:', notifErr);
      }

      // 2.1. Purga chaves antigas de sincronização de app state do Baileys (> 14 dias), mantendo creds
      try {
        const baileysCutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const baileysRes = await prisma.baileysAuthState.deleteMany({
          where: {
            dataId: { not: 'creds' },
            updatedAt: { lt: baileysCutoff },
          },
        });
        if (baileysRes.count > 0) {
          logger.info(`Limpeza de chaves de sessão antigas do Baileys: ${baileysRes.count} purgadas.`);
        }
      } catch (bErr) {
        logger.warn('Aviso na limpeza do BaileysAuthState:', bErr);
      }

      // 3. Localiza conversas que possuem mais de keepCount mensagens
      const conversationsWithManyMessages = await prisma.conversation.findMany({
        select: {
          id: true,
          _count: {
            select: { messages: true },
          },
        },
        where: {
          messages: {
            some: {},
          },
        },
      });

      for (const c of conversationsWithManyMessages) {
        // Conversas ativas com mais de keepCount mensagens
        if (c._count.messages > keepCount) {
          try {
            const res = await this.archiveConversation(c.id, keepCount);
            if (res) {
              archivedConversations++;
              archivedMessages += res.archivedCount;
            }
          } catch (convErr) {
            logger.error(`Erro ao aliviar conversa ${c.id}:`, convErr);
          }
        }
      }

      // 3.1. Conversas inativas há mais de 15 dias com mais de 20 mensagens: arquiva mantendo as 20 mais recentes
      try {
        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
        const inactiveConversations = await prisma.conversation.findMany({
          where: {
            lastMessageAt: { lt: fifteenDaysAgo },
            messages: { some: {} },
          },
          select: {
            id: true,
            _count: { select: { messages: true } },
          },
        });

        for (const ic of inactiveConversations) {
          if (ic._count.messages > 20) {
            try {
              const res = await this.archiveConversation(ic.id, 20);
              if (res) {
                archivedConversations++;
                archivedMessages += res.archivedCount;
              }
            } catch {}
          }
        }
      } catch (inactErr) {
        logger.warn('Aviso ao processar conversas inativas:', inactErr);
      }

      // 4. Sincroniza pendências com o Google Drive
      syncedToDrive = await this.syncPendingToDrive();

      // 5. Status do Google Drive
      const driveTest = await googleDriveService.testConnection();

      logger.info(`Alívio do PostgreSQL concluído: ${archivedMessages} mensagens arquivadas em ${archivedConversations} conversas, ${purgedLogs} logs purgados. Drive conectado: ${driveTest.success}`);

      return {
        success: true,
        archivedConversations,
        archivedMessages,
        purgedLogs,
        purgedNotifications,
        syncedToDrive,
        driveConfigured: googleDriveService.isConfigured(),
        driveStatus: driveTest,
      };
    } catch (err: any) {
      logger.error('Erro geral durante rotina de alívio do PostgreSQL:', err);
      return {
        success: false,
        archivedConversations,
        archivedMessages,
        purgedLogs,
        purgedNotifications,
        syncedToDrive,
        driveConfigured: googleDriveService.isConfigured(),
        error: err?.message || String(err),
      };
    } finally {
      this.isRelieving = false;
    }
  }

  /**
   * Retorna estatísticas de arquivamento para o sistema
   */
  public async getArchiveStats() {
    try {
      const [totalArchives, totalArchivedCount, unsyncedCount, driveTest] = await Promise.all([
        prisma.messageArchive.count(),
        prisma.messageArchive.aggregate({
          _sum: { messageCount: true, fileSize: true },
        }),
        prisma.messageArchive.count({ where: { syncedToDrive: false } }),
        googleDriveService.testConnection(),
      ]);

      return {
        totalArchives,
        totalArchivedMessages: totalArchivedCount._sum.messageCount || 0,
        totalCompressedBytes: totalArchivedCount._sum.fileSize || 0,
        unsyncedArchives: unsyncedCount,
        driveConfigured: googleDriveService.isConfigured(),
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
        driveConfigured: googleDriveService.isConfigured(),
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
