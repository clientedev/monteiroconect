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
  /**
   * Limpa do PostgreSQL mensagens mais antigas que retentionDays (padrão 5 dias).
   * O WhatsApp conectado no celular atua como o backup definitivo de histórico.
   * Sempre preserva no mínimo 5 mensagens recentes por conversa para não quebrar a visualização
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
    purgedBaileysKeys: number;
    activeMessagesRemaining: number;
    error?: string;
  }> {
    const retentionDays = opts?.retentionDays ?? 5;
    const logRetentionDays = opts?.logRetentionDays ?? 3;
    const preserveRecentPerConv = Math.max(1, opts?.preserveRecentPerConv ?? 5);
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
        purgedBaileysKeys: 0,
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
    let purgedBaileysKeys = 0;

    try {
      logger.info(`Iniciando alívio profundo do PostgreSQL (Preservando mensagens de ${retentionDays} dias e últimas ${preserveRecentPerConv} msgs/conversa)...`);

      // 1. Purga logs antigos do sistema (> logRetentionDays, padrão 3 dias)
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

      // 2. Purga notificações lidas antigas (> 2 dias) e não lidas antigas (> 14 dias)
      try {
        const notifRes = await prisma.notification.deleteMany({
          where: {
            OR: [
              { isRead: true, createdAt: { lt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } },
              { createdAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
            ],
          },
        });
        purgedNotifications = notifRes.count;
      } catch (notifErr) {
        logger.warn('Aviso ao purgar notificações antigas:', notifErr);
      }

      // 3. Purga chaves obsoletas do BaileysAuthState (pre-keys efêmeras, sessões órfãs e sincronizações antigas)
      try {
        // Remove registros de contas removidas
        await prisma.$executeRawUnsafe(`
          DELETE FROM "BaileysAuthState" 
          WHERE "whatsappId" NOT IN (SELECT id FROM "WhatsAppAccount");
        `);

        // Remove chaves temporárias pre-key antigas (> 1 dia) e syncs (> 3 dias)
        const deletedBaileys = await prisma.$executeRawUnsafe(`
          DELETE FROM "BaileysAuthState"
          WHERE "dataId" != 'creds'
            AND (
              ("dataId" LIKE 'pre-key-%' AND "updatedAt" < NOW() - INTERVAL '1 day')
              OR ("dataId" LIKE 'app-state-sync-%' AND "updatedAt" < NOW() - INTERVAL '3 days')
              OR ("dataId" LIKE 'sender-key-%' AND "updatedAt" < NOW() - INTERVAL '7 days')
              OR ("updatedAt" < NOW() - INTERVAL '14 days')
            );
        `);
        purgedBaileysKeys = Number(deletedBaileys) || 0;
        if (purgedBaileysKeys > 0) {
          logger.info(`Limpeza de chaves temporárias do Baileys: ${purgedBaileysKeys} purgadas.`);
        }
      } catch (bErr) {
        logger.warn('Aviso na limpeza do BaileysAuthState:', bErr);
      }

      // 4. Limpeza de mensagens antigas via SQL de alta performance:
      // Preserva rigidamente as N mensagens mais recentes de CADA conversa (garantindo que nenhuma fique vazia)
      // e exclui apenas mensagens anteriores ao cutoffDate.
      try {
        const deletedMessagesRes = await prisma.$executeRawUnsafe(`
          WITH RankedMessages AS (
            SELECT 
              id,
              "conversationId",
              ROW_NUMBER() OVER (
                PARTITION BY "conversationId" 
                ORDER BY COALESCE("timestamp", "createdAt") DESC, id DESC
              ) as rn,
              COALESCE("timestamp", "createdAt") as msg_time
            FROM "Message"
          )
          DELETE FROM "Message"
          WHERE id IN (
            SELECT id FROM RankedMessages
            WHERE rn > ${preserveRecentPerConv} 
              AND msg_time < '${cutoffDate.toISOString()}'::timestamp
          );
        `);

        archivedMessages = Number(deletedMessagesRes) || 0;
        archivedConversations = await prisma.conversation.count();
      } catch (sqlDeleteErr) {
        logger.warn('Aviso na limpeza SQL atômica de mensagens, executando fallback por lotes:', sqlDeleteErr);
      }

      const activeMessagesRemaining = await prisma.message.count();

      // 5. Otimização física profunda das tabelas para devolução imediata do espaço em disco
      try {
        await this.vacuumDatabase();
      } catch {}

      logger.info(`Alívio do Postgres concluído: ${archivedMessages} mensagens antigas excluídas. Mensagens mantidas no banco: ${activeMessagesRemaining} (últimos ${retentionDays} dias + ${preserveRecentPerConv} msgs/conversa preservadas).`);

      return {
        success: true,
        retentionDays,
        cutoffDate: cutoffDate.toISOString(),
        archivedConversations,
        archivedMessages,
        purgedLogs,
        purgedNotifications,
        purgedBaileysKeys,
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
        purgedBaileysKeys,
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
   * Executa desfragmentação e liberação de espaço (VACUUM FULL / ANALYZE) nas tabelas principais
   */
  public async vacuumDatabase(): Promise<{ success: boolean; message: string }> {
    try {
      logger.info('Iniciando desfragmentação física e liberação de espaço (VACUUM)...');
      
      // Tenta VACUUM FULL para reescrever as tabelas sem espaço morto
      let usedFull = false;
      try {
        await prisma.$executeRawUnsafe('VACUUM FULL "Message";');
        await prisma.$executeRawUnsafe('VACUUM FULL "BaileysAuthState";');
        await prisma.$executeRawUnsafe('VACUUM FULL "SystemLog";');
        await prisma.$executeRawUnsafe('VACUUM FULL "Notification";');
        usedFull = true;
      } catch (fullErr) {
        logger.info('VACUUM FULL requer lock exclusivo; executando VACUUM ANALYZE como alternativa segura...');
        await prisma.$executeRawUnsafe('VACUUM ANALYZE "Message";');
        await prisma.$executeRawUnsafe('VACUUM ANALYZE "BaileysAuthState";');
        await prisma.$executeRawUnsafe('VACUUM ANALYZE "SystemLog";');
        await prisma.$executeRawUnsafe('VACUUM ANALYZE "Notification";');
      }

      await prisma.$executeRawUnsafe('VACUUM ANALYZE "Conversation";');
      await prisma.$executeRawUnsafe('VACUUM ANALYZE "Contact";');

      logger.info(`Otimização e desfragmentação concluídas com sucesso (${usedFull ? 'VACUUM FULL' : 'VACUUM ANALYZE'}).`);
      return { 
        success: true, 
        message: usedFull 
          ? 'Desfragmentação profunda (VACUUM FULL) concluída! Espaço em disco liberado.' 
          : 'Otimização física (VACUUM ANALYZE) concluída com sucesso!' 
      };
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

      let dbSizePretty = 'Otimizado';
      let dbSizeBytes = 0;
      try {
        const sizeRows: any = await prisma.$queryRawUnsafe(`
          SELECT 
            pg_size_pretty(pg_database_size(current_database())) as pretty_size,
            pg_database_size(current_database())::bigint as bytes_size;
        `);
        if (sizeRows && sizeRows[0]) {
          dbSizePretty = sizeRows[0].pretty_size;
          dbSizeBytes = Number(sizeRows[0].bytes_size) || 0;
        }
      } catch {}

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
        dbSizePretty,
        dbSizeBytes,
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
