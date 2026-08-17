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
import { findMatchingReply, getGreetingForAccount } from '../services/chatbotService.js';

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

      // Mensagens recebidas
      socket.ev.on('messages.upsert', async (m: { type: MessageUpsertType; messages: WAMessage[] }) => {
        if (m.type === 'notify') {
          for (const msg of m.messages) {
            if (msg.key.fromMe) continue;
            await this.handleIncomingMessage(accountId, msg);
          }
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

  private async handleIncomingMessage(accountId: string, msg: WAMessage): Promise<void> {
    try {
      const remoteJid = msg.key.remoteJid || '';
      if (!remoteJid || remoteJid === 'status@broadcast') return;

      const fromPhone = this.jidToContactPhone(remoteJid);
      const pushName = msg.pushName || fromPhone;

      // Salvar/atualizar contato
      let contact = await prisma.contact.findUnique({
        where: { phone_whatsappId: { phone: fromPhone, whatsappId: accountId } },
      });

      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            phone: fromPhone,
            name: pushName,
            whatsappId: accountId,
          },
        });
      } else {
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: { name: pushName || contact.name, lastContact: new Date() },
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
      const message = msg.message || {};
      const messageType = Object.keys(message)[0] || 'unknown';
      let content = '';
      let mediaType: string | null = null;

      const msgObj = (message as any)[messageType];
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

      // Salvar mensagem
      const savedMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          whatsappId: accountId,
          type: messageType === 'conversation' || messageType === 'extendedTextMessage' ? 'text' : (mediaType || messageType),
          content,
          mediaType,
          mediaUrl: savedMediaUrl,
          isFromMe: false,
          messageId: msg.key.id,
          fromPhone: fromPhone,
          toPhone: msg.key.participant || '',
        },
      });

      // Atualizar conversa
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessage: content || `[${mediaType || messageType}]`,
          lastMessageAt: new Date(),
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
        data: { lastMessage: content, lastContact: new Date() },
      });

      // Auto-resposta via Chatbot
      const session = this.sessions.get(accountId);
      if (session?.socket && content) {
        try {
          const contactMsgCount = await prisma.message.count({
            where: {
              conversationId: conversation.id,
              isFromMe: false,
            },
          });

          // Send greeting on first message
          if (contactMsgCount === 1) {
            const greeting = await getGreetingForAccount(accountId);
            if (greeting) {
              await session.socket.sendMessage(remoteJid, { text: greeting });
              await this.saveOutgoingMessage(accountId, remoteJid, greeting, 'text', null, { key: { id: `greeting-${Date.now()}` } });
              logger.info(`Saudação enviada para ${fromPhone} via chatbot`);
            }
          }

          // Check auto-replies
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

    session.reconnectAttempts = 0;
    await this.disconnectSession(accountId, false);
    await this.connectSession(accountId, false);

    for (let i = 0; i < 10; i++) {
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
