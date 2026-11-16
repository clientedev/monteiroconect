import { prisma } from '../database/client.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { accessibleAccountIds, assertAccountAccess, SessionUser } from './accessService.js';
import { sendPushToUser } from './pushNotificationService.js';

/**
 * Agendamento de mensagens: o atendente escolhe contato, texto e data/hora, e o servidor envia
 * sozinho no horário, pelo mesmo caminho de um envio manual (a mensagem aparece na conversa).
 *
 * Regras de segurança do envio:
 * - Cada agendamento é "reservado" (PENDING → SENDING) antes do envio, então nunca sai duplicado.
 * - Se o WhatsApp da conta estiver desconectado no horário, o sistema aguarda a reconexão por até
 *   LATE_TOLERANCE_MS. Passado isso, marca como FALHOU em vez de enviar fora de hora.
 * - Um envio interrompido por reinício do servidor vira FALHOU (com aviso para conferir a conversa),
 *   pois não há como saber se a mensagem chegou a sair.
 */
export const SCHEDULE_STATUS = {
  PENDING: 'PENDING',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
} as const;

const TICK_MS = 30_000;
const LATE_TOLERANCE_MS = 2 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_PER_TICK = 20;
const HISTORY_RETENTION_DAYS = 90;
const MAX_CONTENT_LENGTH = 4096;

export interface ScheduleInput {
  accountId: string;
  to: string;
  contactName?: string | null;
  content: string;
  scheduledAt: string | Date;
  senderName?: string | null;
}

function normalizeRecipient(to: string): string {
  const raw = String(to || '').trim();
  if (!raw) throw new AppError('Informe o contato ou número de destino', 400);
  if (raw.includes('@')) return raw; // JID completo (grupo, @lid) — usado exatamente como veio
  let digits = raw.replace(/\D/g, '');
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) digits = `55${digits}`;
  if (digits.length < 10 || digits.length > 15) {
    throw new AppError('Número de destino inválido. Use DDD + número (ex: 11 99999-9999)', 400);
  }
  return digits;
}

function parseFutureDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError('Data e hora do agendamento inválidas', 400);
  if (date.getTime() < Date.now() - 60_000) {
    throw new AppError('Escolha uma data e hora no futuro', 400);
  }
  return date;
}

function cleanContent(content: string): string {
  const text = String(content || '').trim();
  if (!text) throw new AppError('Escreva a mensagem a ser enviada', 400);
  if (text.length > MAX_CONTENT_LENGTH) {
    throw new AppError(`A mensagem pode ter no máximo ${MAX_CONTENT_LENGTH} caracteres`, 400);
  }
  return text;
}

async function resolveSenderName(senderName?: string | null): Promise<string | null> {
  const name = senderName?.trim();
  if (!name) return null;
  const registered = await prisma.user.findFirst({
    where: { username: name, isActive: true },
    select: { username: true },
  });
  if (!registered) throw new AppError('Atendente selecionado não está cadastrado ou está inativo', 400);
  return registered.username;
}

const withAccount = { whatsapp: { select: { id: true, name: true, phone: true } } } as const;

export async function listScheduledMessages(
  user: SessionUser,
  opts: { status?: string; whatsappId?: string; to?: string } = {},
) {
  const accountIds = await accessibleAccountIds(user);
  const where: any = {};
  if (accountIds) where.whatsappId = { in: accountIds };
  if (opts.whatsappId) {
    await assertAccountAccess(user, opts.whatsappId);
    where.whatsappId = opts.whatsappId;
  }
  if (opts.to) where.toPhone = opts.to;

  const group = (opts.status || 'pending').toLowerCase();
  if (group === 'pending') {
    where.status = { in: [SCHEDULE_STATUS.PENDING, SCHEDULE_STATUS.SENDING] };
    return prisma.scheduledMessage.findMany({ where, include: withAccount, orderBy: { scheduledAt: 'asc' }, take: 300 });
  }
  if (group === 'sent') where.status = SCHEDULE_STATUS.SENT;
  else if (group === 'failed') where.status = { in: [SCHEDULE_STATUS.FAILED, SCHEDULE_STATUS.CANCELED] };
  return prisma.scheduledMessage.findMany({ where, include: withAccount, orderBy: { scheduledAt: 'desc' }, take: 200 });
}

export async function countPendingScheduledMessages(user: SessionUser): Promise<number> {
  const accountIds = await accessibleAccountIds(user);
  return prisma.scheduledMessage.count({
    where: {
      status: SCHEDULE_STATUS.PENDING,
      ...(accountIds ? { whatsappId: { in: accountIds } } : {}),
    },
  });
}

export async function createScheduledMessage(input: ScheduleInput, user: SessionUser) {
  await assertAccountAccess(user, input.accountId);
  const account = await prisma.whatsAppAccount.findUnique({ where: { id: input.accountId }, select: { id: true } });
  if (!account) throw new AppError('Conta de WhatsApp não encontrada', 404);

  const created = await prisma.scheduledMessage.create({
    data: {
      whatsappId: input.accountId,
      toPhone: normalizeRecipient(input.to),
      contactName: input.contactName?.trim() || null,
      content: cleanContent(input.content),
      senderName: await resolveSenderName(input.senderName),
      scheduledAt: parseFutureDate(input.scheduledAt),
      createdById: user.id,
      createdByName: user.username || null,
    },
    include: withAccount,
  });
  logger.info(`[Agendamento] ${created.id} criado por ${user.username || user.id} para ${created.scheduledAt.toISOString()}`);
  return created;
}

async function getOwned(id: string, user: SessionUser) {
  const item = await prisma.scheduledMessage.findUnique({ where: { id } });
  if (!item) throw new AppError('Agendamento não encontrado', 404);
  await assertAccountAccess(user, item.whatsappId);
  return item;
}

/** Edita um agendamento pendente ou reagenda um que falhou/foi cancelado (volta a ficar pendente). */
export async function updateScheduledMessage(
  id: string,
  data: { content?: string; scheduledAt?: string | Date; senderName?: string | null },
  user: SessionUser,
) {
  const item = await getOwned(id, user);
  if (item.status === SCHEDULE_STATUS.SENT) throw new AppError('Esta mensagem já foi enviada', 400);
  if (item.status === SCHEDULE_STATUS.SENDING) throw new AppError('Esta mensagem está sendo enviada agora', 409);

  const patch: any = { status: SCHEDULE_STATUS.PENDING, attempts: 0, lastError: null };
  if (data.content !== undefined) patch.content = cleanContent(data.content);
  if (data.senderName !== undefined) patch.senderName = await resolveSenderName(data.senderName);
  patch.scheduledAt = parseFutureDate(data.scheduledAt ?? item.scheduledAt);

  // Condição no status evita corrida com o agendador pegando o mesmo registro neste instante.
  const result = await prisma.scheduledMessage.updateMany({
    where: { id, status: { in: [SCHEDULE_STATUS.PENDING, SCHEDULE_STATUS.FAILED, SCHEDULE_STATUS.CANCELED] } },
    data: patch,
  });
  if (result.count !== 1) throw new AppError('Esta mensagem está sendo enviada agora', 409);
  return prisma.scheduledMessage.findUnique({ where: { id }, include: withAccount });
}

export async function cancelScheduledMessage(id: string, user: SessionUser) {
  await getOwned(id, user);
  const result = await prisma.scheduledMessage.updateMany({
    where: { id, status: SCHEDULE_STATUS.PENDING },
    data: { status: SCHEDULE_STATUS.CANCELED },
  });
  if (result.count !== 1) throw new AppError('Só é possível cancelar agendamentos pendentes', 400);
  return prisma.scheduledMessage.findUnique({ where: { id }, include: withAccount });
}

export async function deleteScheduledMessage(id: string, user: SessionUser) {
  await getOwned(id, user);
  const result = await prisma.scheduledMessage.deleteMany({
    where: { id, status: { not: SCHEDULE_STATUS.SENDING } },
  });
  if (result.count !== 1) throw new AppError('Esta mensagem está sendo enviada agora', 409);
  return { id };
}

// ───────────────────────── Agendador ─────────────────────────

function notifyCreator(item: { createdById: string | null; contactName: string | null; toPhone: string }, ok: boolean, reason?: string) {
  if (!item.createdById || item.createdById === 'crm_system') return;
  const who = item.contactName || item.toPhone;
  sendPushToUser(item.createdById, {
    title: ok ? 'Mensagem agendada enviada ⏰' : 'Mensagem agendada não enviada ⚠️',
    body: ok ? `Sua mensagem para ${who} foi enviada.` : `Não foi possível enviar para ${who}. ${reason || ''}`.trim(),
    tag: 'scheduled-message',
    data: { url: '/agendamentos' },
  }).catch(() => {});
}

let ticking = false;
let lastPurgeAt = 0;

export async function processDueScheduledMessages(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const now = Date.now();
    const due = await prisma.scheduledMessage.findMany({
      where: { status: SCHEDULE_STATUS.PENDING, scheduledAt: { lte: new Date(now) } },
      orderBy: { scheduledAt: 'asc' },
      take: MAX_PER_TICK,
    });

    for (let index = 0; index < due.length; index++) {
      const item = due[index];
      const lateMs = now - item.scheduledAt.getTime();
      const connected = sessionManager.getSession(item.whatsappId)?.status === 'CONNECTED';

      if (lateMs > LATE_TOLERANCE_MS) {
        const reason = 'O WhatsApp estava indisponível no horário agendado. Reagende para enviar.';
        const expired = await prisma.scheduledMessage.updateMany({
          where: { id: item.id, status: SCHEDULE_STATUS.PENDING },
          data: { status: SCHEDULE_STATUS.FAILED, lastError: reason },
        });
        if (expired.count === 1) {
          logger.warn(`[Agendamento] ${item.id} expirou sem envio (atraso de ${Math.round(lateMs / 60000)} min).`);
          notifyCreator(item, false, reason);
        }
        continue;
      }
      if (!connected) continue; // aguarda a conta reconectar dentro da tolerância

      const claimed = await prisma.scheduledMessage.updateMany({
        where: { id: item.id, status: SCHEDULE_STATUS.PENDING },
        data: { status: SCHEDULE_STATUS.SENDING, attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) continue; // editado/cancelado neste instante

      try {
        await sessionManager.sendMessage(
          item.whatsappId,
          item.toPhone,
          item.content,
          'text',
          undefined,
          undefined,
          undefined,
          item.senderName || undefined,
        );
        await prisma.scheduledMessage.update({
          where: { id: item.id },
          data: { status: SCHEDULE_STATUS.SENT, sentAt: new Date(), lastError: null },
        });
        logger.info(`[Agendamento] ${item.id} enviado para ${item.toPhone}.`);
        notifyCreator(item, true);
      } catch (err: any) {
        const message = String(err?.message || err || 'Falha ao enviar').slice(0, 500);
        const attempts = item.attempts + 1;
        const giveUp = attempts >= MAX_ATTEMPTS;
        await prisma.scheduledMessage.update({
          where: { id: item.id },
          data: { status: giveUp ? SCHEDULE_STATUS.FAILED : SCHEDULE_STATUS.PENDING, lastError: message },
        });
        logger.warn(`[Agendamento] Falha no envio de ${item.id} (tentativa ${attempts}/${MAX_ATTEMPTS}): ${message}`);
        if (giveUp) notifyCreator(item, false, message);
      }

      // Pequeno intervalo humanizado entre envios seguidos (proteção anti-bloqueio).
      if (index < due.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      }
    }

    // Uma vez por dia remove o histórico antigo para manter o banco leve.
    if (now - lastPurgeAt > 24 * 60 * 60 * 1000) {
      lastPurgeAt = now;
      await prisma.scheduledMessage.deleteMany({
        where: {
          status: { in: [SCHEDULE_STATUS.SENT, SCHEDULE_STATUS.FAILED, SCHEDULE_STATUS.CANCELED] },
          updatedAt: { lt: new Date(now - HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000) },
        },
      });
    }
  } catch (err: any) {
    // Tabela ainda não criada no primeiro boot (db push em andamento) ou banco indisponível: tenta no próximo ciclo.
    logger.debug(`[Agendamento] Ciclo ignorado: ${err?.message || err}`);
  } finally {
    ticking = false;
  }
}

export function startScheduledMessageWorker(): void {
  // Envios interrompidos por um reinício: não dá para saber se saíram, então não reenviamos sozinhos.
  setTimeout(() => {
    prisma.scheduledMessage.updateMany({
      where: { status: SCHEDULE_STATUS.SENDING },
      data: {
        status: SCHEDULE_STATUS.FAILED,
        lastError: 'Envio interrompido por reinício do servidor. Confira a conversa antes de reagendar.',
      },
    }).catch(() => {});
  }, 20_000).unref();

  setTimeout(() => { processDueScheduledMessages(); }, 45_000).unref();
  setInterval(() => { processDueScheduledMessages(); }, TICK_MS).unref();
  logger.info('Agendador de mensagens iniciado (verificação a cada 30s).');
}
