import { prisma } from '../database/client.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export async function createWhatsAppAccount(name: string) {
  const session = await sessionManager.createSession(name);
  return {
    id: session.id,
    name: session.name,
    phone: session.phone,
    status: session.status,
  };
}

export async function listWhatsAppAccounts() {
  const accounts = await prisma.whatsAppAccount.findMany({
    orderBy: { createdAt: 'asc' },
  });
  const sessions = sessionManager.getAllSessions();
  const sessionMap = new Map(sessions.map(s => [s.id, s]));

  return accounts.map(acc => {
    const live = sessionMap.get(acc.id);
    return {
      id: acc.id,
      name: acc.name,
      phone: acc.phone,
      status: live?.status || acc.status,
      lastConnection: acc.lastConnection,
      qrCode: live?.qrCode || null,
      createdAt: acc.createdAt,
    };
  });
}

export async function getWhatsAppAccount(id: string) {
  const acc = await prisma.whatsAppAccount.findUnique({ where: { id } });
  if (!acc) throw new AppError('Conta não encontrada', 404);

  const live = sessionManager.getSession(id);
  return {
    id: acc.id,
    name: acc.name,
    phone: acc.phone,
    status: live?.status || acc.status,
    lastConnection: acc.lastConnection,
    qrCode: live?.status === 'QR_CODE' ? live.qrCode : null,
    createdAt: acc.createdAt,
  };
}

export async function disconnectWhatsApp(id: string) {
  await sessionManager.disconnectSession(id, true);
  logger.info(`WhatsApp desconectado: ${id}`);
}

export async function removeWhatsApp(id: string) {
  await sessionManager.removeSession(id);
  logger.info(`WhatsApp removido: ${id}`);
}

export async function refreshQRCode(id: string) {
  const qr = await sessionManager.refreshQRCode(id);
  return { qrCode: qr };
}

export async function sendWhatsAppMessage(
  accountId: string,
  to: string,
  content: string,
  type = 'text',
  mediaUrl?: string,
) {
  return sessionManager.sendMessage(accountId, to, content, type, mediaUrl);
}
