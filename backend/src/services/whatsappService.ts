import { prisma } from '../database/client.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { accessibleAccountIds, assertAccountAccess, SessionUser } from './accessService.js';

export async function createWhatsAppAccount(name: string, creator?: SessionUser) {
  const session = await sessionManager.createSession(name);
  if (creator && creator.role !== 'admin') {
    await prisma.whatsAppAssignment.create({ data: { userId: creator.id, whatsappId: session.id } });
  }
  return {
    id: session.id,
    name: session.name,
    phone: session.phone,
    status: session.status,
  };
}

export async function listWhatsAppAccounts(user: SessionUser) {
  const accountIds = await accessibleAccountIds(user);
  const accounts = await prisma.whatsAppAccount.findMany({
    where: accountIds ? { id: { in: accountIds } } : undefined,
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

export async function getWhatsAppAccount(id: string, user: SessionUser) {
  await assertAccountAccess(user, id);
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

export async function disconnectWhatsApp(id: string, user: SessionUser) {
  await assertAccountAccess(user, id);
  await sessionManager.disconnectSession(id, true);
  logger.info(`WhatsApp desconectado: ${id}`);
}

export async function removeWhatsApp(_id: string) {
  // Histórico de atendimento é dado operacional: nunca é removido pela UI.
  throw new AppError('A remoção de contas foi desativada para preservar todo o histórico', 409);
}

export async function refreshQRCode(id: string, user: SessionUser) {
  await assertAccountAccess(user, id);
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
