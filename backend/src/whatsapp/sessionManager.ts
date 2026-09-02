import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import makeWASocket, {
  DisconnectReason,
  WASocket,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import type { ConnectionState, WAMessage, MessageUpsertType, proto } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { calculateBackoff, sleep } from '../utils/helpers.js';
import { findMatchingReply, getGreetingForAccount, getAiChatbot } from '../services/chatbotService.js';
import { generateAiReply } from '../services/aiService.js';

type SessionStatus = 'CONNECTING' | 'QR_CODE' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR';
type SyncProgressStatus = 'syncing' | 'completed' | 'error';

export interface SyncProgressState {
  status: SyncProgressStatus;
  percent: number;
  processedMessages: number;
  totalMessages: number;
  batches: number;
  phase: 'history' | 'contacts' | 'groups' | 'summaries';
  message: string;
}

interface SessionInfo {
  id: string;
  name: string;
  phone: string | null;
  status: SessionStatus;
  lastConnection: Date | null;
  socket: WASocket | null;
  reconnectAttempts: number;
  qrCode: string | null;
  isDestroying: boolean;
}

function makeLogger() {
  return {
    level: 'silent' as const,
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (msg: string) => logger.warn(`[Baileys] ${msg}`),
    trace: () => {},
    fatal: () => {},
    child: () => makeLogger(),
  };
}

class WhatsAppSessionManager extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private historyImporting = new Set<string>();
  private historyQueue = new Map<string, any[]>();
  private historyProgress = new Map<string, SyncProgressState>();
  private contactAliases = new Map<string, Map<string, string>>();
  private contactNames = new Map<string, Map<string, string>>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();
  private connectionGenerations = new Map<string, number>();
  private realtimeMessageQueues = new Map<string, Promise<void>>();

  constructor() {
    super();
    this.setMaxListeners(200);
  }

  async initialize(): Promise<void> {
    logger.info('Inicializando WhatsAppSessionManager...');

    const accounts = await prisma.whatsAppAccount.findMany();
    for (const account of accounts) {
      const sessionDir = path.join(env.sessionsPath, account.id);
      const hasSession = await this.sessionExists(sessionDir);

      if (hasSession) {
        logger.info(`Restaurando sessão: ${account.name} (${account.id})`);
        this.sessions.set(account.id, {
          id: account.id,
          name: account.name,
          phone: account.phone,
          status: 'RECONNECTING',
          lastConnection: account.lastConnection,
          socket: null,
          reconnectAttempts: 0,
          qrCode: null,
          isDestroying: false,
        });
        await this.connectSession(account.id, false);
      } else {
        logger.info(`Sessão sem dados: ${account.name} (${account.id})`);
        this.sessions.set(account.id, {
          id: account.id,
          name: account.name,
          phone: account.phone,
          status: 'DISCONNECTED',
          lastConnection: account.lastConnection,
          socket: null,
          reconnectAttempts: 0,
          qrCode: null,
          isDestroying: false,
        });
        await prisma.whatsAppAccount.update({
          where: { id: account.id },
          data: { status: 'DISCONNECTED' },
        });
      }
    }

    logger.info(`WhatsAppSessionManager inicializado. ${this.sessions.size} contas carregadas.`);

    // Remove mensagens mais antigas que a janela de sincronização — limpa a
    // poluição de importações antigas que trouxeram anos de histórico
    try {
      const cutoff = new Date(Date.now() - Math.max(1, env.historySyncDays) * 24 * 60 * 60 * 1000);
      const removed = await prisma.message.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (removed.count > 0) {
        logger.info(`Limpeza de histórico: ${removed.count} mensagens antigas removidas (>${env.historySyncDays} dias)`);
      }
    } catch (err) {
      logger.warn('Falha na limpeza de mensagens antigas:', err);
    }
  }

  /**
   * URL da foto de perfil de um JID (aceita telefone, @lid e @g.us).
   * Salva no contato para uso em listas; a rota de avatar usa direto.
   */
  async getAvatarUrl(accountId: string, jid: string): Promise<string | null> {
    const session = this.sessions.get(accountId);
    if (!session?.socket || !jid) return null;
    try {
      const value = jid.trim();
      const normalizedJid = value.includes('@')
        ? value
        : `${value.replace(/\D/g, '')}@s.whatsapp.net`;
      if (normalizedJid === '@s.whatsapp.net') return null;
      return (await session.socket.profilePictureUrl(normalizedJid, 'image', 10_000)) ?? null;
    } catch {
      // sem foto ou sem permissão — normal
      return null;
    }
  }

  async createSession(name: string): Promise<SessionInfo> {
    const account = await prisma.whatsAppAccount.create({
      data: { name, status: 'CONNECTING' },
    });

    const sessionDir = path.join(env.sessionsPath, account.id);
    await fs.mkdir(sessionDir, { recursive: true });

    const info: SessionInfo = {
      id: account.id,
      name,
      phone: null,
      status: 'CONNECTING',
      lastConnection: null,
      socket: null,
      reconnectAttempts: 0,
      qrCode: null,
      isDestroying: false,
    };
    this.sessions.set(account.id, info);

    await this.connectSession(account.id, true);
    return info;
  }

  private async connectSession(accountId: string, isNew: boolean): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session || session.isDestroying) return;

    // Invalida o socket anterior antes de criar outro. O número de geração
    // também impede que eventos atrasados de um socket antigo reconectem ou
    // gravem mensagens depois que a sessão já mudou de conexão.
    const generation = (this.connectionGenerations.get(accountId) || 0) + 1;
    this.connectionGenerations.set(accountId, generation);
    if (session.socket) {
      try { (session.socket.ev as any).removeAllListeners(); } catch {}
      try { (session.socket as any).end?.(undefined); } catch {}
      session.socket = null;
    }

    try {
      session.status = 'CONNECTING';
      this.updateAccountStatus(accountId, 'CONNECTING');
      this.emitStatus(accountId);

      const sessionDir = path.join(env.sessionsPath, accountId);
      await fs.mkdir(sessionDir, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      const socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, makeLogger()),
        },
        printQRInTerminal: false,
        logger: makeLogger(),
        shouldIgnoreJid: () => false,
         // Sem isso, dispositivos novos recebem apenas uma parte do histórico.
         // A janela efetiva continua limitada por shouldSyncHistoryMessage.
         syncFullHistory: true,
        shouldSyncHistoryMessage: (msg: proto.Message.IHistorySyncNotification) => {
          const ts = Number((msg as any).threadTs) || 0;
          if (!ts) return true;
          const cutoff = Date.now() / 1000 - Math.max(1, env.historySyncDays) * 86400;
          return ts >= cutoff;
        },
        // Configurações para manter a sessão online 24/7 sem cair
        keepAliveIntervalMs: 25000,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        markOnlineOnConnect: true,
      });

      session.socket = socket;
      const isCurrentSocket = () =>
        !session.isDestroying &&
        session.socket === socket &&
        this.connectionGenerations.get(accountId) === generation;

      // Credenciais atualizadas
      socket.ev.on('creds.update', saveCreds);

      // Connection events
      socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        if (!isCurrentSocket()) return;

        if (update.qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(update.qr, {
              width: 300,
              margin: 2,
              color: { dark: '#000000', light: '#ffffff' },
            });
            if (!isCurrentSocket()) return;
            session.qrCode = qrDataUrl;
            session.status = 'QR_CODE';
            await this.updateAccountStatus(accountId, 'QR_CODE');
            if (!isCurrentSocket()) return;
            this.emitStatus(accountId);
            this.emit('qr-code', { accountId, qrCode: qrDataUrl });
            logger.info(`QR Code gerado para: ${session.name}`);
          } catch (err) {
            logger.error(`Erro ao gerar QR Code para ${session.name}:`, err);
          }
        }

        if (update.connection === 'open') {
          if (!isCurrentSocket()) return;
          session.status = 'CONNECTED';
          session.reconnectAttempts = 0;
          session.qrCode = null;
          const now = new Date();
          session.lastConnection = now;

          const me = socket.user;
          const phone = me?.id?.split(':')[0] || null;

          await prisma.whatsAppAccount.update({
            where: { id: accountId },
            data: {
              status: 'CONNECTED',
              phone,
              lastConnection: now,
            },
          });

          if (!isCurrentSocket()) return;
          session.phone = phone;
          this.emitStatus(accountId);
          this.emit('connected', { accountId, phone, name: session.name });
          logger.info(`WhatsApp conectado: ${session.name} (${phone})`);

          // Sincroniza grupos e contatos automaticamente ao conectar (idêntico ao WhatsApp Web)
          this.syncNow(accountId).catch(err => logger.warn(`Sincronização pós-conexão (${accountId}):`, err));
        }

        if (update.connection === 'close') {
          if (!isCurrentSocket()) return;
          const statusCode = (update.lastDisconnect?.error as any)?.output?.statusCode as number;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          logger.warn(`Conexão fechada ${session.name}: code=${statusCode}, isLoggedOut=${isLoggedOut}`);

          // Limpa socket atual antes de reconectar
          const closedSocket = session.socket;
          session.socket = null;
          session.qrCode = null;
          if (closedSocket) {
            try { (closedSocket.ev as any).removeAllListeners(); } catch {}
            try { (closedSocket as any).end?.(undefined); } catch {}
          }

          // A sessão SÓ desconecta se o usuário efetivamente deslogou pelo WhatsApp ou pelo painel.
          // Qualquer outro motivo (queda de rede, timeout, restart de servidor) tenta reconectar INDEFINIDAMENTE.
          if (!isLoggedOut && !session.isDestroying) {
            this.scheduleReconnect(accountId);
          } else {
            session.status = 'DISCONNECTED';
            await this.updateAccountStatus(accountId, 'DISCONNECTED');
            this.emitStatus(accountId);
            this.emit('disconnected', { accountId, reason: 'logged_out' });
            logger.info(`Sessão encerrada ${session.name}: necessário novo QR Code`);
          }
        }

        if (update.connection === 'connecting') {
          session.status = 'CONNECTING';
          this.updateAccountStatus(accountId, 'CONNECTING');
          this.emitStatus(accountId);
        }
      });

      // Mensagens recebidas E enviadas de outros dispositivos (celular) —
      // comportamento igual ao WhatsApp Web, que espelha tudo
      socket.ev.on('messages.upsert', async (m: { type: MessageUpsertType; messages: WAMessage[] }) => {
        if (!isCurrentSocket()) return;
        if (m.type !== 'notify' && m.type !== 'append') return;
        const messages = Array.isArray(m.messages) ? m.messages : [];
        for (const msg of messages) {
          if (!isCurrentSocket()) return;
          if (!this.isUsableChatMessage(accountId, msg)) continue;
          this.enqueueRealtimeMessage(accountId, msg);
        }
      });

      // Histórico sincronizado ao vincular dispositivo (como WhatsApp Web)
      socket.ev.on('messaging-history.set', (data: any) => {
        if (!isCurrentSocket()) return;
        const msgs = data?.messages || [];
        const chats = data?.chats || [];
        if (msgs.length > 0 || chats.length > 0 || data?.isLatest === true || Number(data?.progress) >= 100) {
          logger.info(`Histórico recebido: ${msgs.length} mensagens, ${chats.length} conversas (${session.name})`);
          this.enqueueHistory(accountId, data);
        }
      });

      // Os dados de contato podem chegar depois das mensagens, sobretudo para
      // contas que usam LID. Mantemos os aliases e preenchemos nomes faltantes.
      socket.ev.on('contacts.upsert', (contacts: any[]) => {
        if (!isCurrentSocket()) return;
        this.syncContactNames(accountId, contacts).catch(err => logger.warn(`Falha ao sincronizar contatos (${accountId}):`, err));
      });
      socket.ev.on('contacts.update', (contacts: any[]) => {
        if (!isCurrentSocket()) return;
        this.syncContactNames(accountId, contacts).catch(err => logger.warn(`Falha ao atualizar contatos (${accountId}):`, err));
      });
    } catch (err) {
      if (this.connectionGenerations.get(accountId) !== generation) return;
      logger.error(`Erro ao conectar sessão ${accountId}:`, err);
      session.status = 'ERROR';
      if (session.socket) {
        try { (session.socket.ev as any).removeAllListeners(); } catch {}
        try { (session.socket as any).end?.(undefined); } catch {}
      }
      session.socket = null;
      await this.updateAccountStatus(accountId, 'ERROR');
      this.emitStatus(accountId);

      if (!isNew) {
        this.scheduleReconnect(accountId);
      }
    }
  }

  private scheduleReconnect(accountId: string): void {
    const session = this.sessions.get(accountId);
    if (!session || session.isDestroying) return;
    if (this.reconnectTimers.has(accountId)) return;

    const delay = calculateBackoff(
      session.reconnectAttempts,
      env.reconnectInitialDelay,
      env.reconnectMaxDelay,
    );

    session.reconnectAttempts++;
    session.status = 'RECONNECTING';
    this.updateAccountStatus(accountId, 'RECONNECTING').catch(err =>
      logger.warn(`Falha ao salvar status RECONNECTING (${accountId}):`, err),
    );
    this.emitStatus(accountId);

    logger.info(`Reconectando ${session.name} em ${delay}ms (tentativa ${session.reconnectAttempts})`);

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(accountId);
      if (session.isDestroying) return;
      this.connectSession(accountId, false).catch(err => {
        logger.error(`Erro na tentativa de reconexão (${accountId}):`, err);
        this.scheduleReconnect(accountId);
      });
    }, delay);
    this.reconnectTimers.set(accountId, timer);
  }

  private cancelReconnect(accountId: string): void {
    const timer = this.reconnectTimers.get(accountId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(accountId);
  }

  /**
   * Mantém a ordem dos eventos de mensagens de uma conta e repete falhas
   * transitórias de banco/rede. O Baileys pode entregar novos eventos enquanto
   * o lote anterior ainda está sendo persistido.
   */
  private enqueueRealtimeMessage(accountId: string, msg: WAMessage): void {
    const previous = this.realtimeMessageQueues.get(accountId) || Promise.resolve();
    const task = previous
      .catch(() => {})
      .then(async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (msg.key.fromMe) {
              await this.handleOutgoingFromDevice(accountId, msg);
            } else {
              await this.handleIncomingMessage(accountId, msg);
            }
            return;
          } catch (err) {
            if (attempt === 2) {
              logger.error(`Mensagem não persistida após 3 tentativas (${accountId}):`, err);
              return;
            }
            const delay = Math.min(5000, 500 * 2 ** attempt);
            logger.warn(`Falha transitória ao persistir mensagem (${accountId}); nova tentativa em ${delay}ms`);
            await sleep(delay);
          }
        }
      })
      .finally(() => {
        if (this.realtimeMessageQueues.get(accountId) === task) {
          this.realtimeMessageQueues.delete(accountId);
        }
      });
    this.realtimeMessageQueues.set(accountId, task);
  }

  async disconnectSession(accountId: string, logout = true): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) throw new AppError('Sessão não encontrada', 404);

    this.cancelReconnect(accountId);
    session.isDestroying = true;
    session.reconnectAttempts = env.maxReconnectAttempts;
    this.connectionGenerations.set(accountId, (this.connectionGenerations.get(accountId) || 0) + 1);

    if (session.socket && logout) {
      try {
        await session.socket.logout();
      } catch {
        // ignore logout errors
      }
    }

    if (session.socket) {
      try { (session.socket.ev as any).removeAllListeners(); } catch {}
      try { (session.socket as any).end?.(undefined); } catch {}
      session.socket = null;
    }

    if (logout) {
      const sessionDir = path.join(env.sessionsPath, accountId);
      try {
        await fs.rm(sessionDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    session.status = 'DISCONNECTED';
    session.qrCode = null;
    await this.updateAccountStatus(accountId, 'DISCONNECTED');
    this.emitStatus(accountId);
    this.emit('disconnected', { accountId, reason: 'user_action' });
  }

  async removeSession(accountId: string): Promise<void> {
    await this.disconnectSession(accountId, true);
    this.sessions.delete(accountId);

    // Limpeza manual dos dados relacionados — contas antigas no banco podem
    // não ter as FKs com onDelete: Cascade ainda, o que bloquearia o delete.
    try {
      await prisma.$transaction([
        prisma.message.deleteMany({ where: { whatsappId: accountId } }),
        prisma.conversationTag.deleteMany({ where: { conversation: { whatsappId: accountId } } }),
        prisma.conversationAssignment.deleteMany({ where: { conversation: { whatsappId: accountId } } }),
        prisma.conversation.deleteMany({ where: { whatsappId: accountId } }),
        prisma.contact.deleteMany({ where: { whatsappId: accountId } }),
        prisma.chatbot.deleteMany({ where: { whatsappAccountId: accountId } }),
        prisma.systemLog.deleteMany({ where: { whatsappId: accountId } }),
      ]);
    } catch (err) {
      logger.warn(`Limpeza manual falhou para ${accountId} (cascade do schema deve cobrir):`, err);
    }

    await prisma.whatsAppAccount.delete({ where: { id: accountId } });
    logger.info(`Sessão removida: ${accountId}`);
  }

  /**
   * Converte um mediaUrl relativo (ex: /uploads/file.jpg) em caminho absoluto do disco.
   * Se já for caminho absoluto (começa com / em Unix ou letra de drive em Windows), mantém.
   */
  private resolveMediaPath(mediaUrl: string): string {
    if (!mediaUrl.startsWith('/uploads/')) return mediaUrl;
    return path.resolve(process.cwd(), mediaUrl);
  }

  private async mediaPayload(mediaUrl: string): Promise<Buffer | { url: string }> {
    if (/^https?:\/\//i.test(mediaUrl)) return { url: mediaUrl };
    const mediaPath = this.resolveMediaPath(mediaUrl);
    try {
      const buffer = await fs.readFile(mediaPath);
      if (!buffer.length) throw new Error('arquivo vazio');
      return buffer;
    } catch {
      throw new AppError(`Arquivo de mídia não encontrado: ${mediaUrl}`, 400);
    }
  }

  async sendMessage(
    accountId: string,
    to: string,
    content: string,
    type = 'text',
    mediaUrl?: string,
    mediaMimeType?: string,
    mediaFileName?: string,
  ): Promise<any> {
    const session = this.sessions.get(accountId);
    if (!session?.socket) {
      throw new AppError('WhatsApp não está conectado', 400);
    }

    const jid = this.normalizeJid(to);
    const resolvedMedia = mediaUrl ? this.resolveMediaPath(mediaUrl) : undefined;
    let result: any;

    if (type === 'text' || !resolvedMedia) {
      result = await session.socket.sendMessage(jid, { text: content });
    } else if (type === 'image') {
      const image = await this.mediaPayload(mediaUrl!);
      result = await session.socket.sendMessage(jid, { image, caption: content || undefined });
    } else if (type === 'video') {
      const video = await this.mediaPayload(mediaUrl!);
      result = await session.socket.sendMessage(jid, { video, caption: content || undefined });
    } else if (type === 'audio') {
      const audio = await this.mediaPayload(mediaUrl!);
      result = await session.socket.sendMessage(jid, {
        audio,
        mimetype: mediaMimeType || 'audio/ogg; codecs=opus',
        ptt: false,
      });
    } else if (type === 'document') {
      const document = await this.mediaPayload(mediaUrl!);
      result = await session.socket.sendMessage(jid, {
        document,
        caption: content || undefined,
        mimetype: mediaMimeType || 'application/octet-stream',
        fileName: mediaFileName || content || 'documento',
      });
    } else {
      result = await session.socket.sendMessage(jid, { text: content });
    }

    await this.saveOutgoingMessage(accountId, jid, content, type, mediaUrl ?? null, result);
    return result;
  }

  /**
   * Converte um destino (telefone ou JID) em JID válido.
   * Preserva JIDs completos (@g.us = grupos, @lid = contatos com privacidade);
   * apenas números recebem o sufixo @s.whatsapp.net.
   */
  private normalizeJid(to: string): string {
    const t = to.trim();
    if (t.includes('@')) return t; // já é JID completo — usar exatamente como veio
    return `${t.replace(/\D/g, '')}@s.whatsapp.net`;
  }

  /** Normaliza apenas variações do mesmo JID para busca e agrupamento local. */
  private normalizeLookupJid(jid: string): string {
    const value = jid.trim();
    if (value.endsWith('@s.whatsapp.net')) {
      const [number] = value.split('@');
      return `${number.split(':')[0]}@s.whatsapp.net`;
    }
    return value;
  }

  /** Obtém o JID real quando o WhatsApp envia o telefone em remoteJidAlt. */
  private messageRemoteJid(msg: WAMessage): string {
    const key = msg.key as any;
    const primary = typeof key?.remoteJid === 'string' ? key.remoteJid : '';
    const alternative = typeof key?.remoteJidAlt === 'string' ? key.remoteJidAlt : '';
    if (primary.endsWith('@lid') && alternative) return alternative;
    return primary || alternative;
  }

  private messageParticipantJid(msg: WAMessage): string | null {
    const key = msg.key as any;
    return key?.participant || key?.participantAlt || null;
  }

  /**
   * Extrai do JID o identificador de contato — MESMA transformação usada ao
   * salvar mensagens recebidas, para que envio e recebimento caiam no mesmo contato.
   */
  private jidToContactPhone(jid: string): string {
    const normalized = this.normalizeLookupJid(jid);
    if (normalized.endsWith('@s.whatsapp.net')) {
      return normalized.split('@')[0]; // remove sufixo de dispositivo ":N" se houver
    }
    return normalized; // grupos (@g.us) e LIDs (@lid) são mantidos íntegros
  }

  private canonicalJid(accountId: string, jid: string): string {
    const normalized = this.normalizeLookupJid(jid);
    const aliases = this.contactAliases.get(accountId);
    return aliases?.get(jid) || aliases?.get(normalized) || normalized;
  }

  private cachedContactName(accountId: string, jid: string): string | null {
    const names = this.contactNames.get(accountId);
    return names?.get(jid) || names?.get(this.canonicalJid(accountId, jid)) || null;
  }

  private isUsableChatMessage(accountId: string, msg: WAMessage): boolean {
    const remoteJid = this.messageRemoteJid(msg);
    if (!remoteJid || remoteJid === 'status@broadcast') return false;
    const body: any = msg.message || {};
    if (body.protocolMessage || body.reactionMessage || body.senderKeyDistributionMessage) return false;
    return true;
  }

  private async syncContactNames(accountId: string, contacts: any[]): Promise<void> {
    const aliases = this.contactAliases.get(accountId) || new Map<string, string>();
    const names = this.contactNames.get(accountId) || new Map<string, string>();
    this.contactAliases.set(accountId, aliases);
    this.contactNames.set(accountId, names);

    // Versões antigas podiam gravar JID, LID ou número como nome. Esses valores
    // são identificadores técnicos e não devem aparecer para o atendente.
    const savedContacts = await prisma.contact.findMany({
      where: { whatsappId: accountId },
      select: { id: true, phone: true, name: true },
    });
    let cleanedCount = 0;
    for (const contact of savedContacts) {
      if (contact.name && !this.usableContactName(contact.name, contact.phone)) {
        await prisma.contact.update({ where: { id: contact.id }, data: { name: null } });
        cleanedCount++;
      }
    }
    let changed = false;
    for (const item of contacts || []) {
      const rawAliases = [...new Set(
        [item?.id, item?.lid, item?.jid]
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
          .flatMap(value => [value, this.normalizeLookupJid(value)]),
      )];
      if (!rawAliases.length) continue;
      const canonicalSource = [item?.jid, item?.id ? aliases.get(item.id) : undefined, item?.id, item?.lid]
        .find((value): value is string => typeof value === 'string' && value.length > 0);
      if (!canonicalSource) continue;
      const canonical = this.normalizeLookupJid(canonicalSource);
      const contactPhone = this.jidToContactPhone(canonical);
      const name = [item?.name, item?.notify, item?.verifiedName, item?.pushName]
        .map(value => this.usableContactName(value, contactPhone))
        .find((value): value is string => Boolean(value)) || null;
      for (const alias of rawAliases) aliases.set(alias, canonical);
      if (!name) continue;
      for (const alias of [...rawAliases, canonical]) names.set(alias, name);

      // Reconcilia LID ↔ telefone real: quando o WhatsApp revela o par,
      // une contatos/conversas duplicadas criadas antes do mapeamento
      if (typeof item?.id === 'string' && item.id.endsWith('@s.whatsapp.net') &&
          typeof item?.lid === 'string' && item.lid.endsWith('@lid')) {
        if (await this.unifySplitContact(accountId, this.jidToContactPhone(item.id), this.jidToContactPhone(item.lid), name)) {
          changed = true;
        }
      }

      const phones = [...new Set([...rawAliases, canonical].map(jid => this.jidToContactPhone(jid)))];
      const saved = await prisma.contact.findMany({ where: { whatsappId: accountId, phone: { in: phones } } });
      for (const contact of saved) {
        if (!contact.name || !this.usableContactName(contact.name, contact.phone)) {
          await prisma.contact.update({ where: { id: contact.id }, data: { name } });
          changed = true;
        }
      }
    }
    if (changed || cleanedCount > 0) this.emit('contacts-updated', { accountId });
  }

  /**
   * Une o contato criado sob LID com o contato do telefone real. Corrige a
   * "outra versão da conversa": histórico chega pelo telefone, mensagens em
   * tempo real podem chegar pelo LID — sem isso viram duas threads.
   */
  private async unifySplitContact(accountId: string, phone: string, lid: string, name: string | null): Promise<boolean> {
    try {
      const phoneContact = await prisma.contact.findUnique({
        where: { phone_whatsappId: { phone, whatsappId: accountId } },
      });
      const lidContact = await prisma.contact.findUnique({
        where: { phone_whatsappId: { phone: lid, whatsappId: accountId } },
      });
      if (!lidContact) return false;

      if (!phoneContact) {
        // Contato existe só sob LID — assume o telefone real
        await prisma.contact.update({
          where: { id: lidContact.id },
          data: { phone, ...(name ? { name } : {}) },
        });
        logger.info(`Contato ${lid} unificado para o telefone real`);
        return true;
      }

      const keep = await prisma.conversation.findUnique({
        where: { contactId_whatsappId: { contactId: phoneContact.id, whatsappId: accountId } },
      });
      const drop = await prisma.conversation.findUnique({
        where: { contactId_whatsappId: { contactId: lidContact.id, whatsappId: accountId } },
      });

      await prisma.$transaction(async (tx) => {
        if (keep && drop) {
          await tx.message.updateMany({ where: { conversationId: drop.id }, data: { conversationId: keep.id } });
          const newer = !keep.lastMessageAt || !!(drop.lastMessageAt && drop.lastMessageAt > keep.lastMessageAt);
          await tx.conversation.update({
            where: { id: keep.id },
            data: {
              unreadCount: { increment: drop.unreadCount },
              ...(newer && drop.lastMessage ? { lastMessage: drop.lastMessage, lastMessageAt: drop.lastMessageAt } : {}),
            },
          });
          await tx.conversation.delete({ where: { id: drop.id } });
        } else if (drop) {
          await tx.conversation.update({ where: { id: drop.id }, data: { contactId: phoneContact.id } });
        }
        await tx.contact.delete({ where: { id: lidContact.id } });
      });

      logger.info(`Conversas de ${lid} unificadas no contato ${phone}`);
      return true;
    } catch (err) {
      logger.warn(`Falha ao unificar contato ${lid} → ${phone}:`, err);
      return false;
    }
  }

  /**
   * Extrai texto/tipo de uma mensagem Baileys (compartilhado entre
   * mensagens em tempo real e sincronização de histórico).
   * Desembrulha tipos wrapper (efêmeras, visualizar 1x, editadas) e
   * captura o contexto de resposta (reply) quando existir.
   */
  private extractContent(msg: WAMessage): {
    content: string;
    mediaType: string | null;
    messageType: string;
    quotedMessageId: string | null;
    quotedContent: string | null;
  } {
    let m: any = msg.message || {};
    let messageType = Object.keys(m)[0] || 'unknown';

    // Desembrulha wrappers que o WhatsApp usa em respostas/mensagens efêmeras
    const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage', 'editedMessage'];
    for (let i = 0; i < 3 && WRAPPERS.includes(messageType); i++) {
      const inner = m[messageType]?.message;
      if (!inner) break;
      m = inner;
      messageType = Object.keys(m)[0] || 'unknown';
    }

    const msgObj = m[messageType];
    let content = '';
    let mediaType: string | null = null;

    // Contexto de resposta (mensagem citada)
    let quotedMessageId: string | null = null;
    let quotedContent: string | null = null;
    const contextInfo = msgObj?.contextInfo;
    if (contextInfo?.stanzaId) {
      quotedMessageId = String(contextInfo.stanzaId);
      quotedContent = this.protoToText(contextInfo.quotedMessage);
    }

    if (messageType === 'conversation') {
      content = msgObj;
    } else if (messageType === 'extendedTextMessage') {
      content = msgObj?.text || '';
    } else if (messageType === 'imageMessage') {
      content = msgObj?.caption || '';
      mediaType = 'image';
    } else if (messageType === 'audioMessage') {
      mediaType = 'audio';
    } else if (messageType === 'videoMessage') {
      content = msgObj?.caption || '';
      mediaType = 'video';
    } else if (messageType === 'documentMessage') {
      content = msgObj?.fileName || '';
      mediaType = 'document';
    } else if (messageType === 'locationMessage') {
      content = `📍 ${msgObj?.degreesLatitude}, ${msgObj?.degreesLongitude}`;
      mediaType = 'location';
    } else if (messageType === 'contactMessage') {
      content = `👤 ${msgObj?.displayName}`;
      mediaType = 'contact';
    } else if (messageType === 'stickerMessage') {
      mediaType = 'sticker';
    } else {
      content = `[${messageType}]`;
    }

    return { content, mediaType, messageType, quotedMessageId, quotedContent };
  }

  /** Converte uma mensagem citada (proto) em texto curto para preview */
  private protoToText(quoted: any): string | null {
    if (!quoted) return null;
    let q = quoted;
    let t = Object.keys(q)[0];
    const WRAPPERS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage', 'editedMessage'];
    for (let i = 0; i < 3 && WRAPPERS.includes(t); i++) {
      q = q[t]?.message;
      if (!q) return null;
      t = Object.keys(q)[0];
    }
    const o = q?.[t];
    if (!o) return null;
    if (t === 'conversation') return String(o).slice(0, 300);
    if (t === 'extendedTextMessage') return String(o?.text || '').slice(0, 300) || 'Mensagem';
    if (t === 'imageMessage') return o?.caption ? String(o.caption).slice(0, 300) : '📷 Imagem';
    if (t === 'videoMessage') return o?.caption ? String(o.caption).slice(0, 300) : '🎥 Vídeo';
    if (t === 'audioMessage') return '🎵 Áudio';
    if (t === 'stickerMessage') return '🎭 Figurinha';
    if (t === 'documentMessage') return o?.fileName ? String(o.fileName) : '📄 Documento';
    if (t === 'locationMessage') return '📍 Localização';
    if (t === 'contactMessage') return o?.displayName ? `👤 ${o.displayName}` : '👤 Contato';
    return 'Mensagem';
  }

  /** Converte timestamps do WhatsApp (segundos, podendo vir como Long) em Date. */
  private whatsappTimestamp(raw: unknown): Date | null {
    if (raw === null || raw === undefined) return null;
    const value = raw as any;
    const num = typeof value === 'number'
      ? value
      : Number(value?.low ?? value?.value ?? value ?? 0);
    return Number.isFinite(num) && num > 0 ? new Date(num * 1000) : null;
  }

  private msgTimestamp(msg: WAMessage): Date {
    return this.whatsappTimestamp(msg.messageTimestamp) || new Date();
  }

  /** Evita gravar telefone/JID como se fosse o nome do cliente. */
  private usableContactName(value: unknown, phone: string): string | null {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name === phone || /@(?:s\.whatsapp\.net|g\.us|lid)$/.test(name)) return null;
    // Números puros não são um nome de contato.
    if (/^\+?[\d\s().-]{7,}$/.test(name)) return null;
    return name.slice(0, 120);
  }

  /** Nome real do grupo (subject), com cache para evitar chamadas repetidas */
  private groupNameCache = new Map<string, string>();

  private async getGroupName(accountId: string, jid: string): Promise<string | null> {
    const cached = this.groupNameCache.get(jid);
    if (cached) return cached;
    try {
      const session = this.sessions.get(accountId);
      if (!session?.socket) return null;
      const meta = await session.socket.groupMetadata(jid);
      const subject = meta?.subject || null;
      if (subject) this.groupNameCache.set(jid, subject);
      return subject;
    } catch {
      return null;
    }
  }

  /**
   * Mensagem enviada de outro dispositivo da conta (o celular) — espelhada
   * no sistema.
   *
   * FIX 2: Usa upsert com `waMsgId` como chave única para deduplicação
   * atômica. Elimina a race condition do findFirst + create anterior.
   * FIX 3: Grava o timestamp real do WhatsApp no campo `timestamp`.
   */
  private async handleOutgoingFromDevice(accountId: string, msg: WAMessage): Promise<void> {
    try {
      const remoteJid = this.canonicalJid(accountId, this.messageRemoteJid(msg));
      if (!remoteJid || remoteJid === 'status@broadcast') return;

      const waMsgId = msg.key.id || null;

      const contactPhone = this.jidToContactPhone(remoteJid);
      let contact = await prisma.contact.findUnique({
        where: { phone_whatsappId: { phone: contactPhone, whatsappId: accountId } },
      });
      if (!contact) {
        contact = await prisma.contact.create({
          data: { phone: contactPhone, whatsappId: accountId },
        });
      }

      let conversation = await prisma.conversation.findUnique({
        where: { contactId_whatsappId: { contactId: contact.id, whatsappId: accountId } },
      });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { contactId: contact.id, whatsappId: accountId },
        });
      }

      const { content, mediaType, messageType, quotedMessageId, quotedContent } = this.extractContent(msg);
      const ts = this.msgTimestamp(msg);
      const msgType = messageType === 'conversation' || messageType === 'extendedTextMessage'
        ? 'text'
        : (mediaType || messageType);

      let savedMessage: any;
      let alreadyStored = false;
      try {
        savedMessage = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            whatsappId: accountId,
            type: msgType,
            content,
            mediaType,
            mediaUrl: null,
            isFromMe: true,
            isRead: true,
            quotedMessageId,
            quotedContent,
            waMsgId,
            messageId: waMsgId,
            timestamp: ts,
            fromPhone: '',
            toPhone: contactPhone,
          },
        });
      } catch (dbErr: any) {
        if (dbErr?.code === 'P2002' && waMsgId) {
          alreadyStored = true;
          savedMessage = await prisma.message.findFirst({
            where: { conversationId: conversation.id, waMsgId },
          });
        } else {
          throw dbErr;
        }
      }
      if (!savedMessage || alreadyStored) return;

      if (ts > (conversation.lastMessageAt || new Date(0))) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: content || `[${mediaType || messageType}]`,
            lastMessageAt: ts,
          },
        });
      }

      this.emit('message-sent', {
        accountId,
        conversationId: conversation.id,
        contact,
        message: {
          id: savedMessage.id,
          type: savedMessage.type,
          content,
          mediaType,
          mediaUrl: null,
          isFromMe: true,
          quotedMessageId,
          quotedContent,
          timestamp: ts,
          createdAt: savedMessage.createdAt,
        },
      });
    } catch (err) {
      logger.error(`Erro ao espelhar mensagem enviada do celular (${accountId}):`, err);
          throw err;
    }
  }

  /**
   * Importa o histórico sincronizado pelo WhatsApp (messaging-history.set)
   * para o banco — igual ao WhatsApp Web ao vincular um dispositivo novo.
   * Chega em páginas; cada página entra na fila e é processada em sequência
   * com dedupe por messageId.
   */
  private enqueueHistory(accountId: string, data: any): void {
    const q = this.historyQueue.get(accountId) || [];
    q.push(data);
    this.historyQueue.set(accountId, q);

    const previous = this.historyProgress.get(accountId);
    const batchMessages = Array.isArray(data?.messages) ? data.messages.length : 0;
    const batchProgress = Number(data?.progress);
    const nextPercent = Number.isFinite(batchProgress)
      ? Math.max(previous?.percent || 0, Math.min(100, batchProgress))
      : data?.isLatest
        ? Math.max(previous?.percent || 0, 99)
        : Math.max(previous?.percent || 0, Math.min(95, ((previous?.batches || 0) + 1) * 5));
    const progress: SyncProgressState = {
      status: 'syncing',
      percent: nextPercent,
      processedMessages: previous?.processedMessages || 0,
      totalMessages: (previous?.totalMessages || 0) + batchMessages,
      batches: (previous?.batches || 0) + 1,
      phase: 'history',
      message: data?.isLatest ? 'Finalizando histórico...' : 'Recebendo histórico do WhatsApp...',
    };
    this.historyProgress.set(accountId, progress);
    this.emit('sync-progress', { accountId, ...progress, remainingPercent: 100 - progress.percent });

    if (!this.historyImporting.has(accountId)) {
      this.historyImporting.add(accountId);
      this.processHistoryQueue(accountId).catch(() => {});
    }
  }

  getSyncProgress(accountId: string): (SyncProgressState & { remainingPercent: number }) | null {
    const progress = this.historyProgress.get(accountId);
    return progress ? { ...progress, remainingPercent: 100 - progress.percent } : null;
  }

  private async processHistoryQueue(accountId: string): Promise<void> {
    let total = 0;
    let processedBatches = 0;
    let failedBatches = 0;
    try {
      for (;;) {
        const q = this.historyQueue.get(accountId) || [];
        const data = q.shift();
        if (!data) break;
        processedBatches++;
        try {
          total += await this.importHistoryBatchWithRetry(accountId, data);
        } catch (batchErr) {
          failedBatches++;
          logger.error(`[${accountId}] Erro ao importar lote de histórico:`, batchErr);
        }
        const progress = this.historyProgress.get(accountId);
        if (progress) {
          progress.processedMessages += Array.isArray(data?.messages) ? data.messages.length : 0;
          this.historyProgress.set(accountId, progress);
          this.emit('sync-progress', {
            accountId,
            ...progress,
            remainingPercent: 100 - progress.percent,
          });
        }
      }
       // Mesmo um lote sem mensagens pode conter chats novos. O frontend
       // precisa recarregar a lista nesse caso também.
      if (processedBatches > 0) {
        const previous = this.historyProgress.get(accountId);
         const status = failedBatches > 0 ? 'error' : 'completed';
         const completed: SyncProgressState = {
           status,
           percent: failedBatches > 0 ? (previous?.percent || 0) : 100,
          processedMessages: previous?.processedMessages || 0,
          totalMessages: previous?.totalMessages || 0,
          batches: previous?.batches || processedBatches,
          phase: 'history',
           message: failedBatches > 0
             ? `Sincronização incompleta: ${failedBatches} lote(s) falharam`
             : `Sincronização concluída: ${total} mensagens importadas`,
        };
        this.historyProgress.set(accountId, completed);
         this.emit('sync-progress', {
           accountId,
           ...completed,
           remainingPercent: 100 - completed.percent,
         });
        this.emit('history-imported', { accountId, total });
         logger.info(`[${accountId}] Histórico processado: ${total} mensagens importadas${failedBatches > 0 ? `; ${failedBatches} lote(s) falharam` : ''}`);
      }
    } catch (err) {
      logger.error(`[${accountId}] Erro fatal na fila de histórico:`, err);
      const previous = this.historyProgress.get(accountId);
      if (previous) {
        const failed = { ...previous, status: 'error' as const, message: 'Erro ao importar o histórico' };
        this.historyProgress.set(accountId, failed);
        this.emit('sync-progress', { accountId, ...failed, remainingPercent: 100 - failed.percent });
      }
    } finally {
      this.historyImporting.delete(accountId);
      const pending = this.historyQueue.get(accountId);
      if (pending?.length) {
        this.historyImporting.add(accountId);
        this.processHistoryQueue(accountId).catch(() => {});
      } else {
        this.historyQueue.delete(accountId);
      }
    }
  }

  private async importHistoryBatchWithRetry(accountId: string, data: any): Promise<number> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.importHistoryBatch(accountId, data);
      } catch (err) {
        lastError = err;
        if (attempt === 2) break;
        const delay = Math.min(5000, 500 * 2 ** attempt);
        logger.warn(
          `[${accountId}] Falha no lote de histórico; tentativa ${attempt + 2}/3 em ${delay}ms`,
        );
        await sleep(delay);
      }
    }
    throw lastError;
  }

  private async importHistoryBatch(accountId: string, data: any): Promise<number> {
    const limit = env.historyMessageLimit; // 0 = sem limite
    const cutoff = new Date(Date.now() - Math.max(1, env.historySyncDays) * 24 * 60 * 60 * 1000);
    const mediaCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await this.syncContactNames(accountId, data.contacts || []);
    // Nomes de contato vindos do sync (jid -> nome)
    const nameByJid = new Map<string, string>();
    for (const c of data.contacts || []) {
      if (c?.id) {
        const name = String(c.name || c.notify || c.verifiedName || '').trim();
        if (name) nameByJid.set(c.id, name);
        if (c.jid && name) nameByJid.set(c.jid, name);
        if (c.lid && name) nameByJid.set(c.lid, name);
      }
    }

    // Processa data.chats para registrar todas as conversas ativas (1:1 e grupos)
    for (const chat of data.chats || []) {
      if (!chat?.id || chat.id === 'status@broadcast') continue;
      const jid = this.canonicalJid(accountId, chat.id);
      const contactPhone = this.jidToContactPhone(jid);
      const displayName = this.cachedContactName(accountId, jid) || nameByJid.get(jid) || chat.name || null;
      const chatLastMessageAt = this.whatsappTimestamp(
        chat.conversationTimestamp ?? chat.lastMessageRecvTimestamp ?? chat.timestamp,
      );
      const chatLastMessage = typeof chat.lastMessage === 'string' ? chat.lastMessage : null;

      let contact = await prisma.contact.findUnique({
        where: { phone_whatsappId: { phone: contactPhone, whatsappId: accountId } },
      });
      if (!contact) {
        contact = await prisma.contact.create({
          data: { phone: contactPhone, name: this.usableContactName(displayName, contactPhone), whatsappId: accountId },
        });
      } else if (this.usableContactName(displayName, contactPhone) && (!contact.name || contact.name === contact.phone)) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { name: this.usableContactName(displayName, contactPhone) },
        });
      }

      let conversation = await prisma.conversation.findUnique({
        where: { contactId_whatsappId: { contactId: contact.id, whatsappId: accountId } },
      });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { contactId: contact.id, whatsappId: accountId },
        });
      }
      if (
        chatLastMessageAt &&
        chatLastMessageAt >= (conversation.lastMessageAt || new Date(0))
      ) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: chatLastMessage || conversation.lastMessage,
            lastMessageAt: chatLastMessageAt,
          },
        });
      }
    }

    // Agrupa mensagens por conversa
    const byConversation = new Map<string, WAMessage[]>();
    for (const m of data.messages || []) {
      if (!this.isUsableChatMessage(accountId, m)) continue;
      const jid = this.canonicalJid(accountId, this.messageRemoteJid(m));
      if (!jid) continue;
      if (this.msgTimestamp(m) < cutoff) continue;
      const arr = byConversation.get(jid) || [];
      arr.push(m);
      byConversation.set(jid, arr);
    }

    let imported = 0;
    for (const [jid, msgs] of byConversation) {
      const session = this.sessions.get(accountId);
      if (session?.isDestroying) return imported;

      // Baileys usa Long/objeto para timestamp; Number(objeto) resulta em
      // NaN e deixava o lote na ordem reversa (as mensagens mais antigas).
      msgs.sort((a, b) => this.msgTimestamp(a).getTime() - this.msgTimestamp(b).getTime());
      const recent = limit > 0 ? msgs.slice(-limit) : msgs;

      const contactPhone = this.jidToContactPhone(jid);
      const displayName = this.cachedContactName(accountId, jid) || nameByJid.get(jid) || null;

      let contact = await prisma.contact.findUnique({
        where: { phone_whatsappId: { phone: contactPhone, whatsappId: accountId } },
      });
      if (!contact) {
        contact = await prisma.contact.create({
          data: { phone: contactPhone, name: this.usableContactName(displayName, contactPhone), whatsappId: accountId },
        });
      } else if (this.usableContactName(displayName, contactPhone) && (!contact.name || contact.name === contact.phone)) {
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: { name: this.usableContactName(displayName, contactPhone) },
        });
      }

      let conversation = await prisma.conversation.findUnique({
        where: { contactId_whatsappId: { contactId: contact.id, whatsappId: accountId } },
      });
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { contactId: contact.id, whatsappId: accountId },
        });
      }

      // Carrega IDs ja existentes para deduplicacao (usa messageId que sempre existiu)
      const existingMessageIds = new Set<string>();
      try {
        const existing = await prisma.message.findMany({
          where: { conversationId: conversation.id, messageId: { not: null } },
          select: { messageId: true },
        });
        existing.forEach(m => { if (m.messageId) existingMessageIds.add(m.messageId); });
      } catch (dedupeErr) {
        logger.warn(`[${accountId}] Nao foi possivel carregar IDs existentes para dedup: ${dedupeErr}`);
      }

      // Tenta insert em lote com schema completo; faz fallback para schema minimo
      const toCreateFull: any[] = [];
      const toCreateMin: any[] = [];

      for (const m of recent) {
        const mid = m.key?.id;
        if (!mid) continue;
        if (existingMessageIds.has(mid)) continue;
        existingMessageIds.add(mid);

        const { content, mediaType, messageType, quotedMessageId, quotedContent } = this.extractContent(m);
        const ts = this.msgTimestamp(m);
        const isGroupHist = jid.endsWith('@g.us');

        let histMediaUrl: string | null = null;
        if (mediaType && ts >= mediaCutoff) {
          histMediaUrl = await this.tryDownloadMedia(m, mid, mediaType);
        }

        const msgType = messageType === 'conversation' || messageType === 'extendedTextMessage'
          ? 'text' : (mediaType || messageType);

        toCreateFull.push({
          conversationId: conversation.id,
          whatsappId: accountId,
          type: msgType,
          content,
          mediaType,
          mediaUrl: histMediaUrl,
          isFromMe: !!m.key.fromMe,
          isRead: true,
          quotedMessageId,
          quotedContent,
          senderName: isGroupHist ? (m.pushName || null) : null,
           senderJid: isGroupHist ? this.messageParticipantJid(m) : null,
          waMsgId: mid,
          messageId: mid,
          timestamp: ts,
           fromPhone: m.key.fromMe ? '' : contactPhone,
           toPhone: m.key.fromMe ? contactPhone : '',
        });

        toCreateMin.push({
          conversationId: conversation.id,
          whatsappId: accountId,
          type: msgType,
          content,
          mediaType,
          mediaUrl: histMediaUrl,
          isFromMe: !!m.key.fromMe,
          isRead: true,
          quotedMessageId,
          quotedContent,
          messageId: mid,
          fromPhone: m.key.fromMe ? '' : contactPhone,
        });

        if (toCreateFull.length >= 200) {
          const batchFull = toCreateFull.slice();
          const batchMin = toCreateMin.slice();
          toCreateFull.length = 0;
          toCreateMin.length = 0;
          try {
             const result = await prisma.message.createMany({ data: batchFull, skipDuplicates: true });
             imported += result.count;
          } catch {
            logger.warn(`[${accountId}] Fallback compativel no lote de 200`);
            for (const row of batchMin) {
              try { await prisma.message.create({ data: row }); imported++; } catch { /* duplicate ok */ }
            }
          }
        }
      }

      if (toCreateFull.length > 0) {
        const batchMin = toCreateMin.slice();
        try {
           const result = await prisma.message.createMany({ data: toCreateFull, skipDuplicates: true });
           imported += result.count;
        } catch {
          logger.warn(`[${accountId}] Fallback compativel no lote final`);
          for (const row of batchMin) {
            try { await prisma.message.create({ data: row }); imported++; } catch { /* duplicate ok */ }
          }
        }
      }


      // FIX 6: usa timestamp real para lastMessageAt
      const lastMsg = recent[recent.length - 1];
      const lastTs = this.msgTimestamp(lastMsg);
      if (lastTs > (conversation.lastMessageAt || new Date(0))) {
        const { content: lastContent, mediaType: lastMediaType } = this.extractContent(lastMsg);
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessage: lastContent || `[${lastMediaType || 'mídia'}]`,
            lastMessageAt: lastTs,
          },
        });
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            lastMessage: lastContent,
            lastContact: lastTs,
          },
        });
      }

      // Libera o event loop entre conversas
      await new Promise(r => setImmediate(r));
    }

    if (imported > 0) {
      logger.info(`Histórico importado (${accountId}): ${imported} mensagens${data.isLatest ? ' — sincronização completa' : ''}`);
    }
    return imported;
  }

  /**
   * FIX 4 + FIX 5: Tenta baixar mídia de uma mensagem do Baileys.
   *
   * Restringe o download apenas para mídias válidas (imagem, vídeo, áudio, doc, sticker).
   * Evita chamar downloadMediaMessage para localização/contato/texto, o que travava o processo.
   */
  private async tryDownloadMedia(msg: WAMessage, msgId: string, mediaType: string): Promise<string | null> {
    const DOWNLOADABLE = ['image', 'video', 'audio', 'document', 'sticker'];
    if (!mediaType || !DOWNLOADABLE.includes(mediaType)) return null;

    try {
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) return null;

      const extMap: Record<string, string> = {
        image: 'jpg',
        video: 'mp4',
        audio: 'ogg',
        document: 'bin',
        sticker: 'webp',
      };
      const ext = extMap[mediaType] || 'bin';
      const fileName = `${Date.now()}-${msgId}.${ext}`;
      const filePath = path.join(env.uploadPath, fileName);
      await fs.writeFile(filePath, buffer);
      return `/uploads/${fileName}`;
    } catch (err) {
      logger.warn(`Erro ao baixar mídia para mensagem ${msgId}:`, err);
      return null;
    }
  }

  private async handleIncomingMessage(accountId: string, msg: WAMessage): Promise<void> {
    try {
      const remoteJid = this.canonicalJid(accountId, this.messageRemoteJid(msg));
      if (!remoteJid || remoteJid === 'status@broadcast') return;

      const waMsgId = msg.key.id || null;
      const isGroup = remoteJid.endsWith('@g.us');
      const fromPhone = this.jidToContactPhone(remoteJid);
      const pushName = this.usableContactName(msg.pushName || '', fromPhone) || this.cachedContactName(accountId, remoteJid);

      const senderJid = isGroup ? this.messageParticipantJid(msg) : null;
      const senderName = isGroup ? (msg.pushName || (senderJid ? this.jidToContactPhone(senderJid) : null)) : null;

      let contactName = pushName;
      if (isGroup) {
        const groupName = await this.getGroupName(accountId, remoteJid);
        contactName = this.usableContactName(groupName || '', fromPhone);
      }

      let contact = await prisma.contact.findUnique({
        where: { phone_whatsappId: { phone: fromPhone, whatsappId: accountId } },
      });

      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            phone: fromPhone,
            name: contactName,
            whatsappId: accountId,
          },
        });
      } else {
        const shouldRename = !!contactName && (!contact.name || contact.name === contact.phone);
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: { name: shouldRename ? contactName : contact.name },
        });
      }

      let conversation = await prisma.conversation.findUnique({
        where: { contactId_whatsappId: { contactId: contact.id, whatsappId: accountId } },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            contactId: contact.id,
            whatsappId: accountId,
          },
        });
      }

      const { content, mediaType, messageType, quotedMessageId, quotedContent } = this.extractContent(msg);
      const receivedAt = this.msgTimestamp(msg);
      const msgType = messageType === 'conversation' || messageType === 'extendedTextMessage'
        ? 'text'
        : (mediaType || messageType);

      const savedMediaUrl = mediaType ? await this.tryDownloadMedia(msg, waMsgId || Date.now().toString(), mediaType) : null;

      let savedMessage: any;
      let alreadyStored = false;
      try {
        savedMessage = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            whatsappId: accountId,
            type: msgType,
            content,
            mediaType,
            mediaUrl: savedMediaUrl,
            isFromMe: false,
            quotedMessageId,
            quotedContent,
            senderName,
            senderJid,
            waMsgId,
            messageId: waMsgId,
            timestamp: receivedAt,
            fromPhone: fromPhone,
            toPhone: msg.key.participant || '',
          },
        });
      } catch (dbErr: any) {
        if (dbErr?.code === 'P2002' && waMsgId) {
          alreadyStored = true;
          savedMessage = await prisma.message.findFirst({
            where: { conversationId: conversation.id, waMsgId },
          });
        } else {
          logger.warn(`[${accountId}] Salvando mensagem em modo compatível: ${dbErr?.message?.slice(0, 120)}`);
          try {
            savedMessage = await prisma.message.create({
              data: {
                conversationId: conversation.id,
                whatsappId: accountId,
                type: msgType,
                content,
                mediaType,
                mediaUrl: savedMediaUrl,
                isFromMe: false,
                quotedMessageId,
                quotedContent,
                messageId: waMsgId,
                fromPhone: fromPhone,
              },
            });
          } catch (fallbackErr: any) {
            if (fallbackErr?.code === 'P2002' && waMsgId) {
              alreadyStored = true;
              savedMessage = await prisma.message.findFirst({
                where: { conversationId: conversation.id, waMsgId },
              });
            } else {
              logger.error(`[${accountId}] ERRO CRÍTICO ao salvar mensagem incoming:`, fallbackErr);
              return;
            }
          }
        }
      }
      if (!savedMessage || alreadyStored) return;

      const isNewerThanSummary = receivedAt >= (conversation.lastMessageAt || new Date(0));
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          ...(isNewerThanSummary ? {
            lastMessage: content || `[${mediaType || messageType}]`,
            lastMessageAt: receivedAt,
          } : {}),
          unreadCount: { increment: 1 },
        },
      });

      this.emit('message', {
        accountId,
        conversationId: conversation.id,
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          avatarUrl: contact.avatarUrl,
        },
        message: {
          id: savedMessage.id,
          type: savedMessage.type,
          content,
          mediaType,
          mediaUrl: savedMediaUrl,
          isFromMe: false,
          quotedMessageId,
          quotedContent,
          senderName,
          timestamp: receivedAt,
          createdAt: savedMessage.createdAt,
        },
        conversation: {
          id: conversation.id,
          lastMessage: content || `[${mediaType || messageType}]`,
          lastMessageAt: receivedAt,
          unreadCount: (conversation.unreadCount || 0) + 1,
        },
      });

      await prisma.contact.update({
        where: { id: contact.id },
        data: { lastMessage: content, lastContact: receivedAt },
      });

      // Auto-resposta via Chatbot (IA Grok ou regras) — apenas conversas 1:1,
      // nunca em grupos
      const session = this.sessions.get(accountId);
      if (session?.socket && content && !isGroup) {
        try {
          const contactMsgCount = await prisma.message.count({
            where: {
              conversationId: conversation.id,
              isFromMe: false,
            },
          });

          // Saudação na primeira mensagem do contato
          if (contactMsgCount === 1) {
            const greeting = await getGreetingForAccount(accountId);
            if (greeting) {
              await session.socket.sendMessage(remoteJid, { text: greeting });
              await this.saveOutgoingMessage(accountId, remoteJid, greeting, 'text', null, { key: { id: `greeting-${Date.now()}` } });
              logger.info(`Saudação enviada para ${fromPhone} via chatbot`);
            }
          }

          const aiBot = await getAiChatbot(accountId);
          const firstMessageOnly = !!aiBot && aiBot.triggerMode === 'first_message';
          if (!firstMessageOnly || contactMsgCount === 1) {
            let replied = false;

            // IA (Grok) tem prioridade quando habilitada
            if (aiBot) {
              const aiReply = await generateAiReply(conversation.id, content);
              if (aiReply) {
                const aiResult = await session.socket.sendMessage(remoteJid, { text: aiReply });
                await this.saveOutgoingMessage(accountId, remoteJid, aiReply, 'text', null, aiResult);
                logger.info(`Resposta IA (Grok) enviada para ${fromPhone}`);
                replied = true;
              } else {
                logger.warn(`Grok não respondeu para ${fromPhone} — usando regras de auto-resposta`);
              }
            }

            // Regras de palavras-chave (fallback da IA ou modo sem IA)
            if (!replied) {
              const match = await findMatchingReply(accountId, content);
              if (match) {
                let sendResult: any;
                if (match.mediaType === 'image' && match.mediaUrl) {
                   sendResult = await session.socket.sendMessage(remoteJid, {
                     image: await this.mediaPayload(match.mediaUrl),
                     caption: match.reply,
                   });
                } else {
                  sendResult = await session.socket.sendMessage(remoteJid, { text: match.reply });
                }
                await this.saveOutgoingMessage(accountId, remoteJid, match.reply, match.mediaType, match.mediaUrl ?? null, sendResult);
                logger.info(`Auto-resposta enviada para ${fromPhone} via chatbot "${match.chatbotName}"`);
              }
            }
          }
        } catch (botErr) {
          logger.error(`Erro ao processar auto-resposta (${accountId}):`, botErr);
        }
      }
    } catch (err) {
      logger.error(`Erro ao processar mensagem incoming (${accountId}):`, err);
      throw err;
    }
  }

  private async saveOutgoingMessage(
    accountId: string,
    jid: string,
    content: string,
    type: string,
    mediaUrl: string | null,
    result: any,
  ): Promise<void> {
    try {
      const toPhone = this.jidToContactPhone(this.canonicalJid(accountId, jid));
      const waMsgId = result?.key?.id || null;
      const now = new Date();

      let contact = await prisma.contact.findUnique({
        where: { phone_whatsappId: { phone: toPhone, whatsappId: accountId } },
      });

      if (!contact) {
        contact = await prisma.contact.create({
          data: { phone: toPhone, whatsappId: accountId },
        });
      }

      let conversation = await prisma.conversation.findUnique({
        where: { contactId_whatsappId: { contactId: contact.id, whatsappId: accountId } },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: { contactId: contact.id, whatsappId: accountId },
        });
      }

      let savedMessage: any;
      try {
        savedMessage = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            whatsappId: accountId,
            type,
            content,
            mediaUrl,
            mediaType: type === 'text' ? null : type,
            isFromMe: true,
            isRead: true,
            waMsgId,
            messageId: waMsgId,
            timestamp: now,
            fromPhone: '',
            toPhone: toPhone,
          },
        });
      } catch (dbErr: any) {
        if (dbErr?.code === 'P2002' && waMsgId) {
          savedMessage = await prisma.message.findFirst({
            where: { conversationId: conversation.id, waMsgId },
          });
        } else {
          logger.warn(`[${accountId}] saveOutgoingMessage modo compatível: ${dbErr?.message?.slice(0, 120)}`);
          try {
            savedMessage = await prisma.message.create({
              data: {
                conversationId: conversation.id,
                whatsappId: accountId,
                type,
                content,
                mediaUrl,
                mediaType: type === 'text' ? null : type,
                isFromMe: true,
                isRead: true,
                messageId: waMsgId,
                toPhone: toPhone,
              },
            });
          } catch (fallbackErr: any) {
            if (fallbackErr?.code === 'P2002' && waMsgId) {
              savedMessage = await prisma.message.findFirst({
                where: { conversationId: conversation.id, waMsgId },
              });
            } else {
              logger.error(`[${accountId}] ERRO CRÍTICO ao salvar mensagem saída:`, fallbackErr);
              return;
            }
          }
        }
      }
      if (!savedMessage) return;

      // FIX 6: usa timestamp real para lastMessageAt
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessage: content || (type !== 'text' ? `[${type}]` : ''),
          lastMessageAt: now,
        },
      });

      this.emit('message-sent', {
        accountId,
        conversationId: conversation.id,
        contact,
        message: {
          id: savedMessage.id,
          type: savedMessage.type,
          content,
          mediaType: savedMessage.mediaType,
          mediaUrl,
          isFromMe: true,
          timestamp: now,
          createdAt: savedMessage.createdAt,
        },
      });
    } catch (err) {
      logger.error(`Erro ao salvar mensagem enviada (${accountId}):`, err);
    }
  }

  private async updateAccountStatus(accountId: string, status: string): Promise<void> {
    try {
      await prisma.whatsAppAccount.update({
        where: { id: accountId },
        data: { status },
      });
    } catch (err) {
      logger.error(`Erro ao atualizar status da conta ${accountId}:`, err);
    }
  }

  private emitStatus(accountId: string): void {
    const session = this.sessions.get(accountId);
    if (session) {
      this.emit('status-change', {
        accountId,
        status: session.status,
        name: session.name,
        phone: session.phone,
        lastConnection: session.lastConnection,
      });
    }
  }

  getSession(accountId: string): SessionInfo | undefined {
    return this.sessions.get(accountId);
  }

  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => ({
      ...s,
      socket: null,
      qrCode: s.status === 'QR_CODE' ? s.qrCode : null,
    }));
  }

  /**
   * Ressincronização manual: repassa o cache de contatos do WhatsApp
   * (nomes, LID ↔ telefone, unificação de conversas duplicadas) e avisa
   * o frontend para recarregar as listas.
   */
  async syncNow(accountId: string): Promise<{ contacts: number; groups: number }> {
    const session = this.sessions.get(accountId);
    if (!session) throw new AppError('Sessão não encontrada', 404);
    if (!session.socket || session.status !== 'CONNECTED') {
      throw new AppError('WhatsApp não está conectado', 409);
    }

    const manualProgress = (percent: number, phase: SyncProgressState['phase'], message: string, status: SyncProgressStatus = 'syncing') => {
      const progress: SyncProgressState = {
        status,
        percent,
        processedMessages: 0,
        totalMessages: 0,
        batches: 0,
        phase,
        message,
      };
      this.historyProgress.set(accountId, progress);
      this.emit('sync-progress', { accountId, ...progress, remainingPercent: 100 - percent });
    };
    manualProgress(0, 'contacts', 'Preparando sincronização...');

    // 1. Sincroniza contatos da memória do Baileys
    const cache = (session.socket as any).contacts || {};
    const contacts = Object.values(cache) as any[];
    if (contacts.length > 0) {
      await this.syncContactNames(accountId, contacts);
    }
    manualProgress(35, 'contacts', `${contacts.length} contatos encontrados`);

    // 2. Busca TODOS os grupos em que a conta participa e garante contatos e conversas
    let groupsCount = 0;
    try {
      const groupsMap = await session.socket.groupFetchAllParticipating();
      const groupsList = Object.values(groupsMap || {});
      groupsCount = groupsList.length;

      for (const g of groupsList) {
        if (!g.id) continue;
        const groupJid = g.id;
        const groupName = g.subject || 'Grupo';
        this.groupNameCache.set(groupJid, groupName);

        const contactPhone = this.jidToContactPhone(groupJid);
        let contact = await prisma.contact.findUnique({
          where: { phone_whatsappId: { phone: contactPhone, whatsappId: accountId } },
        });

        if (!contact) {
          contact = await prisma.contact.create({
            data: { phone: contactPhone, name: groupName, whatsappId: accountId },
          });
        } else if (!contact.name || contact.name === contact.phone) {
          contact = await prisma.contact.update({
            where: { id: contact.id },
            data: { name: groupName },
          });
        }

        let conversation = await prisma.conversation.findUnique({
          where: { contactId_whatsappId: { contactId: contact.id, whatsappId: accountId } },
        });
        if (!conversation) {
          await prisma.conversation.create({
            data: { contactId: contact.id, whatsappId: accountId },
          });
        }
      }
      logger.info(`Sincronização de grupos (${accountId}): ${groupsCount} grupos encontrados e atualizados.`);
    } catch (groupErr) {
      logger.warn(`Falha ao buscar grupos em syncNow (${accountId}):`, groupErr);
    }
    manualProgress(70, 'groups', `${groupsCount} grupos encontrados`);

    // Corrige resumos que ficaram inconsistentes em importações interrompidas
    // ou em versões antigas que ordenavam apenas por createdAt.
    manualProgress(85, 'summaries', 'Recalculando resumos das conversas...');
    await this.repairConversationSummaries(accountId);

    this.emit('contacts-updated', { accountId });
    this.emit('history-imported', { accountId, count: contacts.length });
    manualProgress(100, 'summaries', 'Sincronização concluída', 'completed');
    return { contacts: contacts.length, groups: groupsCount };
  }

  private async repairConversationSummaries(accountId: string): Promise<void> {
    const conversations = await prisma.conversation.findMany({
      where: { whatsappId: accountId },
      select: { id: true },
    });

    for (const conversation of conversations) {
      const latest = await prisma.message.findFirst({
        where: { conversationId: conversation.id },
        orderBy: [
          { timestamp: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      });
      if (!latest) continue;

      const lastMessageAt = latest.timestamp || latest.createdAt;
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessage: latest.content || `[${latest.mediaType || latest.type}]`,
          lastMessageAt,
        },
      });
      await prisma.contact.updateMany({
        where: {
          conversations: { some: { id: conversation.id } },
        },
        data: {
          lastMessage: latest.content,
          lastContact: lastMessageAt,
        },
      });
    }
  }

  async refreshQRCode(accountId: string): Promise<string> {
    const session = this.sessions.get(accountId);
    if (!session) throw new AppError('Sessão não encontrada', 404);

    if (session.qrCode) return session.qrCode;

    // Este é o botão explícito "Atualizar QR". Diferente de "Reconectar",
    // ele pode invalidar a sessão atual para gerar um QR novo.
    this.cancelReconnect(accountId);
    session.isDestroying = true;
    this.connectionGenerations.set(accountId, (this.connectionGenerations.get(accountId) || 0) + 1);
    if (session.socket) {
      try { (session.socket.ev as any).removeAllListeners(); } catch {}
      try { (session.socket as any).end?.(undefined); } catch {}
    }
    session.socket = null;
    session.isDestroying = false;
    session.reconnectAttempts = 0;

    // Destroy old session data on disk to force a fresh QR
    const sessionDir = path.join(env.sessionsPath, accountId);
    try { await fs.rm(sessionDir, { recursive: true, force: true }); } catch {}
    await fs.mkdir(sessionDir, { recursive: true });

    await this.connectSession(accountId, true);

    for (let i = 0; i < 15; i++) {
      if (session.qrCode) return session.qrCode;
      await sleep(1000);
    }

    throw new AppError('Não foi possível gerar QR Code', 500);
  }

  /**
   * Retoma a sessão existente sem remover credenciais. Se o processo tiver
   * perdido a sessão no disco, o fluxo de criação pode gerar QR normalmente;
   * em uma sessão válida, Baileys restaura o login sem pedir novo QR.
   */
  async reconnectSession(accountId: string): Promise<{ status: SessionStatus; qrCode: string | null }> {
    const session = this.sessions.get(accountId);
    if (!session) throw new AppError('Sessão não encontrada', 404);

    if (session.status === 'CONNECTED' && session.socket) {
      return { status: session.status, qrCode: null };
    }

    this.cancelReconnect(accountId);
    session.isDestroying = false;
    session.reconnectAttempts = 0;
    const sessionDir = path.join(env.sessionsPath, accountId);
    const hasSession = await this.sessionExists(sessionDir);

    await this.connectSession(accountId, !hasSession);
    return { status: session.status, qrCode: session.qrCode };
  }

  private async sessionExists(dir: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) return false;
      const files = await fs.readdir(dir);
      return files.length > 0;
    } catch {
      return false;
    }
  }

  async destroy(): Promise<void> {
    for (const accountId of this.reconnectTimers.keys()) this.cancelReconnect(accountId);
    for (const [id] of this.sessions) {
      try {
        await this.disconnectSession(id, false);
      } catch {
        // ignore on shutdown
      }
    }
    this.sessions.clear();
    this.removeAllListeners();
  }
}

export const sessionManager = new WhatsAppSessionManager();
