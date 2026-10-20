import { prisma } from '../database/client.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

class ArchiveService {
  private isRelieving = false;
  private relievingStartedAt = 0;

  constructor() {
    logger.info('Storage & Archive Service inicializado (Estratégia: WhatsApp Cloud Backup + Postgres Leve com retenção de 5 dias).');
  }

  /**
   * Limpa do PostgreSQL mensagens mais antigas que retentionDays (padrão 5 dias).
   * O WhatsApp conectado no celular atua como o backup definitivo de histórico.
   * Sempre preserva no mínimo 1 mensagem recente por conversa para não quebrar a visualização
   * na lista de conversas, e preserva 100% das mensagens dos últimos N dias.
   */
  public async cleanOldMessages(opts?: {
    retentionDays?: number;
    preserveRecentPerConv?: number;
    logRetentionDays?: number;
  }): Promise<{
    success: boolean;
    retentionDays: number;
    cutoffDate: string;
    archivedConversations: number;
    archivedMessages: number;
    purgedLogs: number;
    purgedNotifications: number;
    activeMessagesRemaining: number;
    error?: string;
  }> {
    const retentionDays = opts?.retentionDays ?? 5;
    const logRetentionDays = opts?.logRetentionDays ?? retentionDays;
    const preserveRecentPerConv = opts?.preserveRecentPerConv ?? 5;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // Se o processo estiver travado há mais de 2 minutos, reseta automaticamente
    if (this.isRelieving && (Date.now() - this.relievingStartedAt > 120000)) {
      logger.warn('Lock de limpeza do Postgres expirou (> 2min). Destravando automaticamente...');
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
        activeMessagesRemaining: await prisma.message.count(),
        error: 'Uma rotina de alívio do banco de dados já está em execução.',
      };
    }

    this.isRelieving = true;
    this.relievingStartedAt = Date.now();

    let archivedConversations = 0;
    let archivedMessages = 0;
    let purgedLogs = 0;
    let purgedNotifications = 0;

    try {
      logger.info(`Iniciando alívio do PostgreSQL (Preservando mensagens de ${retentionDays} dias, cutoff: ${cutoffDate.toISOString()})...`);

      // 1. Purga logs antigos do sistema (> retentionDays)
      try {
        const logCutoff = new Date(Date.now() - logRetentionDays * 24 * 60 * 60 * 1000);
        const logRes = await prisma.systemLog.deleteMany({
          where: { createdAt: { lt: logCutoff } },
        });
        purgedLogs = logRes.count;
        if (purgedLogs > 0) {
          logger.info(`Limpeza de logs do sistema: ${purgedLogs} registros purgados (> ${logRetentionDays} dias)`);
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

      // 3. Purga chaves temporárias antigas do Baileys (> retentionDays), mantendo 'creds' e sessões ativas
      try {
        await prisma.$executeRawUnsafe(`
          DELETE FROM "BaileysAuthState" 
          WHERE "whatsappId" NOT IN (SELECT id FROM "WhatsAppAccount");
        `);

        const baileysRes = await prisma.baileysAuthState.deleteMany({
          where: {
            dataId: { not: 'creds' },
            OR: [
              { dataId: { startsWith: 'pre-key-' }, updatedAt: { lt: cutoffDate } },
              { dataId: { startsWith: 'app-state-sync-key-' }, updatedAt: { lt: cutoffDate } },
              { updatedAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
            ],
          },
        });
        if (baileysRes.count > 0) {
          logger.info(`Limpeza de chaves de sincronização do Baileys: ${baileysRes.count} purgadas.`);
        }
      } catch (bErr) {
        logger.warn('Aviso na limpeza do BaileysAuthState:', bErr);
      }

      // 4. Localiza conversas que possuem mensagens elegíveis (> retentionDays)
      const conversations = await prisma.conversation.findMany({
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
        select: { id: true },
      });

      const messageIdsToDelete: string[] = [];

      for (const conv of conversations) {
        // Preserva as N mensagens mais recentes para a conversa ter preview garantido
        let protectedIds = new Set<string>();
        if (preserveRecentPerConv > 0) {
          const recentOnes = await prisma.message.findMany({
            where: { conversationId: conv.id },
            orderBy: [
              { timestamp: { sort: 'desc', nulls: 'last' } },
              { createdAt: 'desc' },
              { id: 'desc' },
            ],
            take: preserveRecentPerConv,
            select: { id: true },
          });
          protectedIds = new Set(recentOnes.map(m => m.id));
        }

        const eligible = await prisma.message.findMany({
          where: {
            conversationId: conv.id,
            id: { notIn: Array.from(protectedIds) },
            OR: [
              { timestamp: { lt: cutoffDate } },
              { timestamp: null, createdAt: { lt: cutoffDate } },
            ],
          },
          select: { id: true },
        });

        if (eligible.length > 0) {
          archivedConversations++;
          archivedMessages += eligible.length;
          messageIdsToDelete.push(...eligible.map(m => m.id));
        }
      }

      // Exclui do Postgres em lotes para performance ideal
      if (messageIdsToDelete.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < messageIdsToDelete.length; i += batchSize) {
          const batch = messageIdsToDelete.slice(i, i + batchSize);
          await prisma.message.deleteMany({
            where: { id: { in: batch } },
          });
        }
      }

      const activeMessagesRemaining = await prisma.message.count();

      // Executa otimização física no PostgreSQL (VACUUM ANALYZE) para liberar espaço no disco do Railway
      try {
        await prisma.$executeRawUnsafe('VACUUM ANALYZE "Message";');
        await prisma.$executeRawUnsafe('VACUUM ANALYZE "BaileysAuthState";');
        await prisma.$executeRawUnsafe('VACUUM ANALYZE "SystemLog";');
        await prisma.$executeRawUnsafe('VACUUM ANALYZE "Notification";');
      } catch {}

      logger.info(`Limpeza do Postgres concluída: ${archivedMessages} mensagens antigas excluídas em ${archivedConversations} conversas. Mensagens restantes no banco: ${activeMessagesRemaining} (últimos ${retentionDays} dias mantidos).`);

      return {
        success: true,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        archivedConversations,
        archivedMessages,
        purgedLogs,
        purgedNotifications,
        activeMessagesRemaining,
      };
    } catch (err: any) {
      logger.error('Erro durante rotina de alívio do PostgreSQL:', err);
      return {
        success: false,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        archivedConversations,
        archivedMessages,
        purgedLogs,
        purgedNotifications,
        activeMessagesRemaining: await prisma.message.count().catch(() => 0),
        error: err?.message || String(err),
      };
    } finally {
      this.isRelieving = false;
      this.relievingStartedAt = 0;
    }
  }

  /**
   * Alias de compatibilidade para a rotina de alívio
   */
  public async relieveDatabase(opts?: {
    retentionDays?: number;
    keepCount?: number;
    logRetentionDays?: number;
    preserveRecentPerConv?: number;
  }) {
    const res = await this.cleanOldMessages(opts);
    return {
      ...res,
      syncedToDrive: 0,
      driveConfigured: false,
      driveStatus: { success: true },
    };
  }

  /**
   * Reseta o lock de execução caso tenha ficado preso
   */
  public resetLock(): { success: boolean; message: string } {
    this.isRelieving = false;
    this.relievingStartedAt = 0;
    logger.info('Lock de alívio do banco de dados resetado manualmente.');
    return { success: true, message: 'Rotina de otimização destravada com sucesso.' };
  }

  /**
   * Executa VACUUM FULL nas tabelas principais para devolver espaço livre ao SO no Railway
   */
  public async vacuumDatabase(): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('Iniciando desfragmentação profunda e liberação de espaço (VACUUM)...');
      await prisma.$executeRawUnsafe('VACUUM ANALYZE "Message";');
      await prisma.$executeRawUnsafe('VACUUM ANALYZE "BaileysAuthState";');
      await prisma.$executeRawUnsafe('VACUUM ANALYZE "SystemLog";');
      await prisma.$executeRawUnsafe('VACUUM ANALYZE "Notification";');
      await prisma.$executeRawUnsafe('VACUUM ANALYZE "Conversation";');
      await prisma.$executeRawUnsafe('VACUUM ANALYZE "Contact";');
      logger.info('Otimização e alívio do Postgres concluídos com sucesso.');
      return { success: true, message: 'Otimização e desfragmentação concluídas com sucesso.' };
    } catch (err: any) {
      logger.warn('Aviso no VACUUM do PostgreSQL:', err);
      return { success: false, message: err?.message || String(err) };
    }
  }

  /**
   * Retorna estatísticas de armazenamento do PostgreSQL
   */
  public async getArchiveStats() {
    try {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      const [
        activeMessagesInDb,
        eligibleForArchive,
        totalConversations,
        totalContacts,
      ] = await Promise.all([
        prisma.message.count(),
        prisma.message.count({
          where: {
            OR: [
              { timestamp: { lt: fiveDaysAgo } },
              { timestamp: null, createdAt: { lt: fiveDaysAgo } },
            ],
          },
        }),
        prisma.conversation.count(),
        prisma.contact.count(),
      ]);

      const recentMessagesRetained = Math.max(0, activeMessagesInDb - eligibleForArchive);

      return {
        totalArchives: 0,
        totalArchivedMessages: 0,
        totalCompressedBytes: 0,
        unsyncedArchives: 0,
        activeMessagesInDb,
        eligibleForArchive,
        recentMessagesRetained,
        totalConversations,
        totalContacts,
        retentionDaysDefault: 5,
        driveConfigured: false,
        driveAccountEmail: null,
        driveStatus: { success: true },
        keepLimitPerConv: env.archiveKeepMessagesPerConv,
      };
    } catch (err) {
      logger.warn('Aviso ao consultar estatísticas de armazenamento:', err);
      return {
        totalArchives: 0,
        totalArchivedMessages: 0,
        totalCompressedBytes: 0,
        unsyncedArchives: 0,
        activeMessagesInDb: 0,
        eligibleForArchive: 0,
        recentMessagesRetained: 0,
        totalConversations: 0,
        totalContacts: 0,
        retentionDaysDefault: 5,
        driveConfigured: false,
        driveAccountEmail: null,
        driveStatus: { success: true },
        keepLimitPerConv: env.archiveKeepMessagesPerConv,
      };
    }
  }

  /**
   * Compatibilidade para consultas de mensagens arquivadas
   */
  public async getArchivedMessages(conversationId: string): Promise<any[]> {
    return [];
  }

  /**
   * Compatibilidade para sincronização
   */
  public async syncPendingToDrive(): Promise<number> {
    return 0;
  }
}

export const archiveService = new ArchiveService();
