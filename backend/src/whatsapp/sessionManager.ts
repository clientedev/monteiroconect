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
import type { ConnectionState, WAMessage, MessageUpsertType } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { calculateBackoff, sleep } from '../utils/helpers.js';
import { findMatchingReply, getGreetingForAccount, getAiChatbot } from '../services/chatbotService.js';
import { generateAiReply } from '../services/aiService.js';

type SessionStatus = 'CONNECTING' | 'QR_CODE' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR';

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
        // Sincroniza o histórico completo, igual ao vincular um novo
        // dispositivo no WhatsApp Web
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true,
      });

      session.socket = socket;

      // Credenciais atualizadas
      socket.ev.on('creds.update', saveCreds);

      // Connection events
      socket.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        if (session.isDestroying) return;

        if (update.qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(update.qr, {
              width: 300,
              margin: 2,
              color: { dark: '#000000', light: '#ffffff' },
            });
            session.qrCode = qrDataUrl;
            session.status = 'QR_CODE';
            await this.updateAccountStatus(accountId, 'QR_CODE');
            this.emitStatus(accountId);
            this.emit('qr-code', { accountId, qrCode: qrDataUrl });
            logger.info(`QR Code gerado para: ${session.name}`);
          } catch (err) {
            logger.error(`Erro ao gerar QR Code para ${session.name}:`, err);
          }
        }

        if (update.connection === 'open') {
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

          session.phone = phone;
          this.emitStatus(accountId);
          this.emit('connected', { accountId, phone, name: session.name });
          logger.info(`WhatsApp conectado: ${session.name} (${phone})`);
        }

        if (update.connection === 'close') {
          const statusCode = (update.lastDisconnect?.error as any)?.output?.statusCode as number;
          const shouldReconnect =
            statusCode !== DisconnectReason.loggedOut &&
            statusCode !== DisconnectReason.badSession &&
            !session.isDestroying;

          logger.warn(`Conexão fechada ${session.name}: code=${statusCode}, shouldReconnect=${shouldReconnect}`);

          session.socket = null;
          session.qrCode = null;

          if (shouldReconnect) {
            this.attemptReconnect(accountId);
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
        if (m.type === 'notify') {
          for (const msg of m.messages) {
            if (!msg.key.remoteJid || msg.key.remoteJid === 'status@broadcast') continue;
            if (msg.key.fromMe) {
              await this.handleOutgoingFromDevice(accountId, msg);
            } else {
              await this.handleIncomingMessage(accountId, msg);
            }
          }
        }
      });

      // Histórico sincronizado ao vincular dispositivo (como WhatsApp Web)
      socket.ev.on('messaging-history.set', (data: any) => {
        if (session.isDestroying) return;
        const msgs = data?.messages || [];
        if (msgs.length > 0) {
          logger.info(`Histórico recebido: ${msgs.length} mensagens (${session.name})`);
          this.enqueueHistory(accountId, data);
        }
      });
    } catch (err) {
      logger.error(`Erro ao conectar sessão ${accountId}:`, err);
      session.status = 'ERROR';
      session.socket = null;
      await this.updateAccountStatus(accountId, 'ERROR');
      this.emitStatus(accountId);

      if (!isNew) {
        this.attemptReconnect(accountId);
      }
    }
  }

  private async attemptReconnect(accountId: string): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session || session.isDestroying) return;

    if (session.reconnectAttempts >= env.maxReconnectAttempts) {
      logger.error(`Máximo de tentativas de reconexão atingido: ${session.name}`);
      session.status = 'ERROR';
      await this.updateAccountStatus(accountId, 'ERROR');
      this.emitStatus(accountId);
      this.emit('reconnect-failed', { accountId });
      return;
    }

    const delay = calculateBackoff(
      session.reconnectAttempts,
      env.reconnectInitialDelay,
      env.reconnectMaxDelay,
    );

    session.reconnectAttempts++;
    session.status = 'RECONNECTING';
    await this.updateAccountStatus(accountId, 'RECONNECTING');
    this.emitStatus(accountId);

    logger.info(`Reconectando ${session.name} em ${delay}ms (tentativa ${session.reconnectAttempts})`);

    await sleep(delay);
    if (!session.isDestroying) {
      await this.connectSession(accountId, false);
    }
  }

  async disconnectSession(accountId: string, logout = true): Promise<void> {
    const session = this.sessions.get(accountId);
    if (!session) throw new AppError('Sessão não encontrada', 404);

    session.isDestroying = true;
    session.reconnectAttempts = env.maxReconnectAttempts;

    if (session.socket && logout) {
      try {
        await session.socket.logout();
      } catch {
        // ignore logout errors
      }
    }

    if (session.socket) {
      (session.socket.ev as any).removeAllListeners();
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

  async sendMessage(accountId: string, to: string, content: string, type = 'text', mediaUrl?: string): Promise<any> {
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
      result = await session.socket.sendMessage(jid, { image: { url: resolvedMedia }, caption: content || undefined });
    } else if (type === 'video') {
      result = await session.socket.sendMessage(jid, { video: { url: resolvedMedia }, caption: content || undefined });
    } else if (type === 'audio') {
      result = await session.socket.sendMessage(jid, { audio: { url: resolvedMedia }, mimetype: 'audio/mp4' });
    } else if (type === 'document') {
      result = await session.socket.sendMessage(jid, { document: { url: resolvedMedia }, caption: content || undefined, mimetype: 'application/octet-stream' });
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

  /**
   * Extrai do JID o identificador de contato — MESMA transformação usada ao
   * salvar mensagens recebidas, para que envio e recebimento caiam no mesmo contato.
   */
  private jidToContactPhone(jid: string): string {
    if (jid.endsWith('@s.whatsapp.net')) {
      return jid.split('@')[0].split(':')[0]; // remove sufixo de dispositivo ":N" se houver
    }
    return jid; // grupos (@g.us) e LIDs (@lid) são mantidos íntegros
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

  /** Converte messageTimestamp (segundos, podendo vir como Long) em Date */
  private msgTimestamp(msg: WAMessage): Date {
    const raw = msg.messageTimestamp as any;
    const num = typeof raw === 'number' ? raw : Number(raw?.low ?? raw ?? 0);
    return Number.isFinite(num) && num > 0 ? new Date(num * 1000) : new Date();
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
   * no sistema, com dedupe do eco das mensagens enviadas pelo próprio sistema.
   */
  private async handleOutgoingFromDevice(accountId: string, msg: WAMessage): Promise<void> {
    try {
      const remoteJid = msg.key.remoteJid || '';
      if (!remoteJid || remoteJid === 'status@broadcast') return;

      const contactPhone = this.jidToContactPhone(remoteJid);
      let contact = await prisma.contact.findUnique({
        where: { phone_whatsappId: { phone: contactPhone, whatsappId: accountId } },
      });
      if (!contact) {
        contact = await prisma.contact.create({
          // Em mensagens enviadas, pushName normalmente é o nome da própria
          // conta, e não do destinatário.
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

      // Eco da mensagem enviada pelo próprio sistema — já está salva
      if (msg.key.id) {
        const exists = await prisma.message.findFirst({
          where: { conversationId: conversation.id, messageId: msg.key.id },
          select: { id: true },
        });
        if (exists) return;
      }

      const { content, mediaType, messageType, quotedMessageId, quotedContent } = this.extractContent(msg);
      const ts = this.msgTimestamp(msg);

      const savedMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          whatsappId: accountId,
          type: messageType === 'conversation' || messageType === 'extendedTextMessage' ? 'text' : (mediaType || messageType),
          content,
          mediaType,
          mediaUrl: null,
          isFromMe: true,
          isRead: true,
          quotedMessageId,
          quotedContent,
          messageId: msg.key.id,
          fromPhone: '',
          toPhone: contactPhone,
          createdAt: ts,
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessage: content || `[${mediaType || messageType}]`,
          ...(ts > (conversation.lastMessageAt || new Date(0)) ? { lastMessageAt: ts } : {}),
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
          mediaType,
          mediaUrl: null,
          isFromMe: true,
          quotedMessageId,
          quotedContent,
          createdAt: savedMessage.createdAt,
        },
      });
    } catch (err) {
      logger.error(`Erro ao espelhar mensagem enviada do celular (${accountId}):`, err);
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

    if (!this.historyImporting.has(accountId)) {
      this.historyImporting.add(accountId);
      this.processHistoryQueue(accountId).catch(() => {});
    }
  }

  private async processHistoryQueue(accountId: string): Promise<void> {
    let total = 0;
    try {
      for (;;) {
        const q = this.historyQueue.get(accountId) || [];
        const data = q.shift();
        if (!data) break;
        total += await this.importHistoryBatch(accountId, data);
      }
      if (total > 0) {
        this.emit('history-imported', { accountId, total });
      }
    } finally {
      this.historyImporting.delete(accountId);
      this.historyQueue.delete(accountId);
    }
  }

  private async importHistoryBatch(accountId: string, data: any): Promise<number> {
    const limit = env.historyMessageLimit;
    if (limit <= 0) return 0;

    // Nomes de contato vindos do sync (jid -> nome)
    const nameByJid = new Map<string, string>();
    for (const c of data.contacts || []) {
      if (c?.id) {
        const name = String(c.name || c.notify || c.verifiedName || '').trim();
        if (name) nameByJid.set(c.id, name);
      }
    }

    // Agrupa mensagens por conversa
    const byConversation = new Map<string, WAMessage[]>();
    for (const m of data.messages || []) {
      const jid = m.key?.remoteJid || '';
      if (!jid || jid === 'status@broadcast') continue;
      const arr = byConversation.get(jid) || [];
      arr.push(m);
      byConversation.set(jid, arr);
    }

    let imported = 0;
    for (const [jid, msgs] of byConversation) {
      const session = this.sessions.get(accountId);
      if (session?.isDestroying) return imported;

      msgs.sort((a: any, b: any) => Number(a.messageTimestamp || 0) - Number(b.messageTimestamp || 0));
      const recent = limit > 0 ? msgs.slice(-limit) : msgs;

      const contactPhone = this.jidToContactPhone(jid);
      const displayName = nameByJid.get(jid) || null;

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

      const existing = new Set(
        (await prisma.message.findMany({
          where: { conversationId: conversation.id },
          select: { messageId: true },
        })).map(m => m.messageId)
      );

      const toCreate: any[] = [];
      for (const m of recent) {
        const mid = m.key?.id;
        if (!mid || existing.has(mid)) continue;
        existing.add(mid);

        const { content, mediaType, messageType, quotedMessageId, quotedContent } = this.extractContent(m);
        const isGroupHist = jid.endsWith('@g.us');
        toCreate.push({
          conversationId: conversation.id,
          whatsappId: accountId,
          type: messageType === 'conversation' || messageType === 'extendedTextMessage' ? 'text' : (mediaType || messageType),
          content,
          mediaType,
          mediaUrl: null,
          isFromMe: !!m.key.fromMe,
          isRead: true,
          quotedMessageId,
          quotedContent,
          senderName: isGroupHist ? (m.pushName || null) : null,
          senderJid: isGroupHist ? (m.key.participant || null) : null,
          messageId: mid,
          fromPhone: m.key.fromMe ? '' : contactPhone,
          toPhone: m.key.fromMe ? contactPhone : '',
          createdAt: this.msgTimestamp(m),
        });

        if (toCreate.length >= 200) {
          await prisma.message.createMany({ data: toCreate });
          imported += toCreate.length;
          toCreate.length = 0;
        }
      }
      if (toCreate.length > 0) {
        await prisma.message.createMany({ data: toCreate });
        imported += toCreate.length;
      }

      // Atualiza a conversa apenas se o histórico trouxe algo mais recente
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

  private async handleIncomingMessage(accountId: string, msg: WAMessage): Promise<void> {
    try {
      const remoteJid = msg.key.remoteJid || '';
      if (!remoteJid || remoteJid === 'status@broadcast') return;

      const isGroup = remoteJid.endsWith('@g.us');
      const fromPhone = this.jidToContactPhone(remoteJid);
      const pushName = this.usableContactName(msg.pushName, fromPhone);

      // Em grupo: contato = grupo (nome real via metadata); remetente fica
      // registrado em cada mensagem (senderName/senderJid)
      const senderJid = isGroup ? (msg.key.participant || null) : null;
      const senderName = isGroup ? (msg.pushName || (senderJid ? this.jidToContactPhone(senderJid) : null)) : null;

      let contactName = pushName;
      if (isGroup) {
        const groupName = await this.getGroupName(accountId, remoteJid);
        contactName = this.usableContactName(groupName, fromPhone);
      }

      // Salvar/atualizar contato
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
        // Só sobrescreve o nome se ainda for o fallback (telefone/JID),
        // preservando nomes editados manualmente
        const shouldRename = !!contactName && (!contact.name || contact.name === contact.phone);
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: { name: shouldRename ? contactName : contact.name },
        });
      }

      // Buscar ou criar conversa
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

      // Extrair conteúdo da mensagem
      const { content, mediaType, messageType, quotedMessageId, quotedContent } = this.extractContent(msg);
      const receivedAt = this.msgTimestamp(msg);

      // Download mídia se aplicável
      let savedMediaUrl: string | null = null;
      const msgContent = (msg.message as any)[messageType];
      if (mediaType && msgContent && typeof msgContent === 'object' && msgContent.directPath) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          if (buffer) {
            const ext = mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'ogg' : 'bin';
            const fileName = `${Date.now()}-${msg.key.id}.${ext}`;
            const filePath = path.join(env.uploadPath, fileName);
            await fs.writeFile(filePath, buffer);
            savedMediaUrl = `/uploads/${fileName}`;
          }
        } catch (mediaErr) {
          logger.warn(`Falha ao baixar mídia (${accountId}):`, mediaErr);
        }
      }

      // Salvar mensagem — dedupe por messageId (histórico pode repetir)
      if (msg.key.id) {
        const exists = await prisma.message.findFirst({
          where: { conversationId: conversation.id, messageId: msg.key.id },
          select: { id: true },
        });
        if (exists) return;
      }

      const savedMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          whatsappId: accountId,
          type: messageType === 'conversation' || messageType === 'extendedTextMessage' ? 'text' : (mediaType || messageType),
          content,
          mediaType,
          mediaUrl: savedMediaUrl,
          isFromMe: false,
          quotedMessageId,
          quotedContent,
          senderName,
          senderJid,
          messageId: msg.key.id,
          fromPhone: fromPhone,
          toPhone: msg.key.participant || '',
          createdAt: receivedAt,
        },
      });

      // Atualizar conversa
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessage: content || `[${mediaType || messageType}]`,
          lastMessageAt: receivedAt,
          unreadCount: { increment: 1 },
        },
      });

      // Emitir via WebSocket
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
          createdAt: savedMessage.createdAt,
        },
        conversation: {
          id: conversation.id,
          unreadCount: (conversation.unreadCount || 0) + 1,
        },
      });

      // Atualizar contato
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
                  sendResult = await session.socket.sendMessage(remoteJid, { image: { url: match.mediaUrl }, caption: match.reply });
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
      const toPhone = this.jidToContactPhone(jid);

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

      // O eco de uma mensagem enviada pode chegar antes desta rotina terminar.
      // A verificação torna o armazenamento idempotente mesmo nesses casos.
      if (result?.key?.id) {
        const existing = await prisma.message.findFirst({
          where: { conversationId: conversation.id, messageId: result.key.id },
          select: { id: true },
        });
        if (existing) return;
      }

      const savedMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          whatsappId: accountId,
          type,
          content,
          mediaUrl,
          mediaType: type === 'text' ? null : type,
          isFromMe: true,
          messageId: result?.key?.id,
          fromPhone: '',
          toPhone: toPhone,
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessage: content || (type !== 'text' ? `[${type}]` : ''),
          lastMessageAt: new Date(),
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

  async refreshQRCode(accountId: string): Promise<string> {
    const session = this.sessions.get(accountId);
    if (!session) throw new AppError('Sessão não encontrada', 404);

    if (session.qrCode) return session.qrCode;

    // Reset flags so connectSession can proceed
    session.isDestroying = false;
    session.reconnectAttempts = 0;
    session.socket = null;

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
