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

export async function removeWhatsApp(id: string, user: SessionUser) {
  await assertAccountAccess(user, id);
  await sessionManager.removeSession(id);
  logger.info(`WhatsApp e todo o histórico removidos: ${id}`);
}

export async function refreshQRCode(id: string, user: SessionUser) {
  await assertAccountAccess(user, id);
  const qr = await sessionManager.refreshQRCode(id);
  return { qrCode: qr };
}

export async function reconnectWhatsApp(id: string, user: SessionUser) {
  await assertAccountAccess(user, id);
  return sessionManager.reconnectSession(id);
}

export async function syncWhatsApp(id: string, user: SessionUser) {
  await assertAccountAccess(user, id);
  const result = await sessionManager.syncNow(id);
  logger.info(`Sincronização manual concluída (${id}): ${result.contacts} contatos, ${result.groups} grupos`);
  return result;
}

export async function getWhatsAppSyncProgress(id: string, user: SessionUser) {
  await assertAccountAccess(user, id);
  return sessionManager.getSyncProgress(id);
}

export async function sendWhatsAppMessage(
  accountId: string,
  to: string,
  content: string,
  type = 'text',
  mediaUrl?: string,
  mediaMimeType?: string,
  mediaFileName?: string,
  user?: SessionUser,
  senderName?: string,
) {
  if (user) await assertAccountAccess(user, accountId);
  const selectedName = senderName?.trim();
  if (selectedName) {
    const registeredUser = await prisma.user.findFirst({
      where: { username: selectedName, isActive: true },
      select: { username: true },
    });
    if (!registeredUser) {
      throw new AppError('Atendente selecionado não está cadastrado ou está inativo', 400);
    }
  }
  return sessionManager.sendMessage(
    accountId,
    to,
    content,
    type,
    mediaUrl,
    mediaMimeType,
    mediaFileName,
    selectedName || user?.username,
  );
}

export async function broadcastWhatsAppMessages(
  data: {
    accountId: string;
    recipients: string[];
    content: string;
    type?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
    mediaFileName?: string;
  },
  user: SessionUser,
) {
  await assertAccountAccess(user, data.accountId);

  const results: Array<{ to: string; ok: boolean; error?: string }> = [];
  for (let index = 0; index < data.recipients.length; index++) {
    const to = data.recipients[index];
    try {
      await sessionManager.sendMessage(
        data.accountId,
        to,
        data.content,
        data.type || 'text',
        data.mediaUrl,
        data.mediaMimeType,
        data.mediaFileName,
        user.username,
      );
      results.push({ to, ok: true });
    } catch (err: any) {
      results.push({ to, ok: false, error: err?.message || 'Falha ao enviar' });
    }

    // Espaça os envios para reduzir bloqueios por rajada no WhatsApp.
    if (index < data.recipients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  const sent = results.filter(result => result.ok).length;
  return {
    success: results.every(result => result.ok),
    total: results.length,
    sent,
    failed: results.length - sent,
    results,
  };
}
