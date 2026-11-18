import crypto from 'node:crypto';
import { prisma } from '../database/client.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { accessibleAccountIds, assertAccountAccess, SessionUser } from './accessService.js';
import { sendPushToUser } from './pushNotificationService.js';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getBusyIntervals,
  serviceAccountEmail,
  CalendarAccessStatus,
} from './googleCalendarService.js';
import {
  AvailabilityRules,
  DEFAULT_WORKING_HOURS,
  Interval,
  WorkingHours,
  availabilityRange,
  brtParts,
  computeFreeSlots,
  dayKey,
  firstName,
  formatDateLong,
  formatDateShort,
  formatSlotsForMessage,
  formatTime,
  normalizeBrPhone,
  pickSlotsForMessage,
  renderTemplate,
} from './availability.js';
import { CAROL_CALENDARS, CAROL_TARGET_CALENDAR } from '../config/calendarPresets.js';

/**
 * Automações de agendamento.
 *
 * Fluxo: a automação tem uma lista de destinatários. Enquanto está ATIVA, um envio por vez sai
 * pelo WhatsApp escolhido (intervalo aleatório de 25 a 50s, só dentro da janela de envio),
 * com os próximos horários livres e um link pessoal. No link o cliente vê todos os horários
 * livres naquele momento e confirma um; o horário fica reservado (índice único no banco
 * impede dois clientes no mesmo horário), a reunião é gravada na agenda de destino quando há
 * permissão, o cliente recebe a confirmação no WhatsApp e a equipe é avisada.
 */

const MIN_GAP_MS = 25_000;
const MAX_GAP_MS = 50_000;
const WORKER_TICK_MS = 15_000;
const MAX_ATTEMPTS = 3;

export const DEFAULT_MESSAGE_TEMPLATE = [
  'Olá, {primeiro_nome}! Tudo bem? Aqui é a Carol, sua corretora 😊',
  '',
  'Estou fazendo a revisão das apólices dos meus clientes e quero marcar uma conversa rápida com você para revisarmos a sua.',
  '',
  'Meus próximos horários livres:',
  '{horarios}',
  '',
  'Para escolher o melhor horário e já deixar confirmado, é só tocar aqui:',
  '{link}',
  '',
  'Se preferir, me responda por aqui mesmo com o dia e horário. 💙',
].join('\n');

export const DEFAULT_CONFIRMATION_TEMPLATE = [
  'Perfeito, {primeiro_nome}! ✅',
  'Sua {titulo} está confirmada para {data} às {hora}.',
  '',
  'Se precisar trocar o horário, use o mesmo link: {link}',
].join('\n');

// ───────────────────────── helpers ─────────────────────────

function newToken(): string {
  return crypto.randomBytes(18).toString('base64url');
}

function rulesOf(a: {
  workingHours: any; durationMinutes: number; bufferMinutes: number; daysAhead: number;
  minNoticeHours: number; skipHolidays: boolean;
}): AvailabilityRules {
  return {
    workingHours: (a.workingHours as WorkingHours) || DEFAULT_WORKING_HOURS,
    durationMinutes: a.durationMinutes,
    bufferMinutes: a.bufferMinutes,
    daysAhead: a.daysAhead,
    minNoticeHours: a.minNoticeHours,
    skipHolidays: a.skipHolidays,
  };
}

function calendarIdsOf(a: { calendars: any }): string[] {
  return Array.isArray(a.calendars) ? a.calendars.map((c: any) => String(c?.id || '')).filter(Boolean) : [];
}

function bookingLink(a: { publicBaseUrl: string | null }, token: string): string {
  const base = (a.publicBaseUrl || process.env.PUBLIC_APP_URL || 'https://whatsapp.monteiroseguros.com.br').replace(/\/+$/, '');
  return `${base}/agendar/${token}`;
}

function hhmmToMinutes(value: string): number {
  const [h, m] = String(value || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Horários livres da automação agora: agendas Google (se compartilhadas) + reuniões já
 * confirmadas por esta automação. Se a leitura das agendas falhar, NÃO oferece horários
 * (melhor não enviar do que oferecer um horário em que a Carol está ocupada).
 */
export async function availableSlots(
  automation: any,
  opts: { bypassCache?: boolean; ignoreBookingId?: string } = {},
): Promise<{ slots: Interval[]; calendarStatus: CalendarAccessStatus[]; calendarError?: string }> {
  const now = Date.now();
  const rules = rulesOf(automation);
  const { from, to } = availabilityRange(rules, now);
  const busy: Interval[] = [];
  let calendarStatus: CalendarAccessStatus[] = [];
  let calendarError: string | undefined;

  const ids = calendarIdsOf(automation);
  if (ids.length > 0) {
    try {
      const result = await getBusyIntervals(ids, new Date(from), new Date(to), { bypassCache: opts.bypassCache });
      busy.push(...result.busy);
      calendarStatus = result.status;
      const blocked = result.status.filter(s => !s.ok);
      if (blocked.length > 0 && blocked.length === result.status.length) {
        calendarError = 'Nenhuma das agendas está compartilhada com o sistema ainda.';
      }
    } catch (err: any) {
      calendarError = err?.message || 'Falha ao consultar as agendas';
    }
  }

  const bookings = await prisma.automationBooking.findMany({
    where: {
      status: 'CONFIRMED',
      startAt: { lt: new Date(to) },
      endAt: { gt: new Date(from) },
      ...(opts.ignoreBookingId ? { id: { not: opts.ignoreBookingId } } : {}),
    },
    select: { startAt: true, endAt: true },
  });
  for (const b of bookings) busy.push({ start: b.startAt.getTime(), end: b.endAt.getTime() });

  if (calendarError && ids.length > 0) return { slots: [], calendarStatus, calendarError };
  return { slots: computeFreeSlots(rules, busy, now), calendarStatus, calendarError };
}

function messageFor(automation: any, recipient: { name: string | null; token: string }, slots: Interval[]): string {
  const picked = pickSlotsForMessage(slots, Math.max(1, automation.slotsInMessage || 6));
  return renderTemplate(automation.messageTemplate || DEFAULT_MESSAGE_TEMPLATE, {
    nome: recipient.name?.trim() || '',
    primeiro_nome: firstName(recipient.name),
    horarios: formatSlotsForMessage(picked),
    link: bookingLink(automation, recipient.token),
    titulo: automation.meetingTitle || 'reunião',
  });
}

/** Sem nome conhecido, "Olá, {primeiro_nome}!" vira "Olá!" em vez de "Olá, !". */
function tidyGreeting(text: string): string {
  return text.replace(/,\s*([!?.])/g, '$1').replace(/[ \t]+\n/g, '\n').trim();
}

function finalMessage(automation: any, recipient: { name: string | null; token: string }, slots: Interval[]): string {
  return tidyGreeting(messageFor(automation, recipient, slots));
}

// ───────────────────────── CRUD ─────────────────────────

const automationSummarySelect = {
  id: true, name: true, status: true, bookingOpen: true, whatsappId: true, meetingTitle: true,
  lastError: true, createdAt: true, updatedAt: true, createdByName: true,
  whatsapp: { select: { id: true, name: true, status: true } },
} as const;

export async function listAutomations(user: SessionUser) {
  const accountIds = await accessibleAccountIds(user);
  const items = await prisma.automation.findMany({
    where: accountIds ? { whatsappId: { in: accountIds } } : {},
    select: automationSummarySelect,
    orderBy: { createdAt: 'desc' },
  });
  const ids = items.map(i => i.id);
  const [recipientCounts, bookingCounts] = await Promise.all([
    prisma.automationRecipient.groupBy({ by: ['automationId', 'status'], where: { automationId: { in: ids } }, _count: { _all: true } }),
    prisma.automationBooking.groupBy({ by: ['automationId'], where: { automationId: { in: ids }, status: 'CONFIRMED' }, _count: { _all: true } }),
  ]);
  return items.map(item => {
    const stats: Record<string, number> = { PENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
    for (const r of recipientCounts) if (r.automationId === item.id) stats[r.status] = r._count._all;
    const booked = bookingCounts.find(b => b.automationId === item.id)?._count._all || 0;
    return { ...item, stats: { ...stats, total: Object.values(stats).reduce((a, b) => a + b, 0), booked } };
  });
}

async function getOwned(id: string, user: SessionUser) {
  const automation = await prisma.automation.findUnique({
    where: { id },
    include: { whatsapp: { select: { id: true, name: true, status: true, phone: true } } },
  });
  if (!automation) throw new AppError('Automação não encontrada', 404);
  await assertAccountAccess(user, automation.whatsappId);
  return automation;
}

export async function getAutomation(id: string, user: SessionUser) {
  const automation = await getOwned(id, user);
  const [recipientCounts, bookings] = await Promise.all([
    prisma.automationRecipient.groupBy({ by: ['status'], where: { automationId: id }, _count: { _all: true } }),
    prisma.automationBooking.count({ where: { automationId: id, status: 'CONFIRMED' } }),
  ]);
  const stats: Record<string, number> = { PENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
  for (const r of recipientCounts) stats[r.status] = r._count._all;
  return { ...automation, stats: { ...stats, total: Object.values(stats).reduce((a, b) => a + b, 0), booked: bookings } };
}

export interface AutomationInput {
  name?: string;
  whatsappId?: string;
  calendars?: Array<{ id: string; name?: string }>;
  targetCalendarId?: string | null;
  meetingTitle?: string;
  durationMinutes?: number;
  bufferMinutes?: number;
  daysAhead?: number;
  minNoticeHours?: number;
  slotsInMessage?: number;
  workingHours?: WorkingHours;
  skipHolidays?: boolean;
  messageTemplate?: string;
  confirmationTemplate?: string;
  senderName?: string | null;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  bookingOpen?: boolean;
}

function sanitizeInput(input: AutomationInput): Record<string, any> {
  const out: Record<string, any> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new AppError('Dê um nome para a automação', 400);
    out.name = name.slice(0, 120);
  }
  if (input.calendars !== undefined) {
    out.calendars = input.calendars
      .map(c => ({ id: String(c.id || '').trim(), name: String(c.name || c.id || '').trim().slice(0, 80) }))
      .filter(c => c.id.length > 3)
      .slice(0, 50);
  }
  if (input.targetCalendarId !== undefined) out.targetCalendarId = input.targetCalendarId?.trim() || null;
  if (input.meetingTitle !== undefined) out.meetingTitle = input.meetingTitle.trim().slice(0, 80) || 'Reunião';
  const clamp = (v: number | undefined, min: number, max: number) => (v === undefined ? undefined : Math.max(min, Math.min(max, Math.round(Number(v) || 0))));
  const numbers: Array<[keyof AutomationInput, number, number]> = [
    ['durationMinutes', 10, 240], ['bufferMinutes', 0, 120], ['daysAhead', 1, 60], ['minNoticeHours', 0, 168], ['slotsInMessage', 1, 12],
  ];
  for (const [key, min, max] of numbers) {
    const v = clamp(input[key] as number | undefined, min, max);
    if (v !== undefined) out[key] = v;
  }
  if (input.workingHours !== undefined) {
    const wh: WorkingHours = {};
    for (const [day, windows] of Object.entries(input.workingHours || {})) {
      if (!/^[0-6]$/.test(day) || !Array.isArray(windows)) continue;
      const valid = windows
        .filter(w => Array.isArray(w) && /^\d{1,2}:\d{2}$/.test(w[0]) && /^\d{1,2}:\d{2}$/.test(w[1]) && hhmmToMinutes(w[1]) > hhmmToMinutes(w[0]))
        .map(w => [w[0], w[1]] as [string, string])
        .slice(0, 4);
      if (valid.length) wh[day] = valid;
    }
    out.workingHours = wh;
  }
  if (input.skipHolidays !== undefined) out.skipHolidays = !!input.skipHolidays;
  if (input.bookingOpen !== undefined) out.bookingOpen = !!input.bookingOpen;
  if (input.messageTemplate !== undefined) {
    const t = input.messageTemplate.trim();
    if (!t) throw new AppError('Escreva a mensagem que será enviada', 400);
    if (!t.includes('{link}') && !t.includes('{horarios}')) {
      throw new AppError('A mensagem precisa ter {horarios} e/ou {link} para o cliente ver os horários', 400);
    }
    out.messageTemplate = t.slice(0, 3000);
  }
  if (input.confirmationTemplate !== undefined) out.confirmationTemplate = input.confirmationTemplate.trim().slice(0, 1500) || DEFAULT_CONFIRMATION_TEMPLATE;
  if (input.senderName !== undefined) out.senderName = input.senderName?.trim() || null;
  for (const key of ['sendWindowStart', 'sendWindowEnd'] as const) {
    if (input[key] !== undefined) {
      if (!/^\d{1,2}:\d{2}$/.test(String(input[key]))) throw new AppError('Horário da janela de envio inválido', 400);
      out[key] = input[key];
    }
  }
  return out;
}

export async function createAutomation(input: AutomationInput, user: SessionUser, publicBaseUrl: string | null) {
  if (!input.whatsappId) throw new AppError('Escolha o WhatsApp que fará os envios', 400);
  await assertAccountAccess(user, input.whatsappId);
  const data = sanitizeInput({ name: input.name || 'Revisão de apólice', ...input });
  const created = await prisma.automation.create({
    data: {
      name: data.name,
      whatsappId: input.whatsappId,
      calendars: data.calendars ?? CAROL_CALENDARS,
      targetCalendarId: data.targetCalendarId !== undefined ? data.targetCalendarId : CAROL_TARGET_CALENDAR,
      meetingTitle: data.meetingTitle ?? 'Revisão de apólice',
      durationMinutes: data.durationMinutes ?? 30,
      bufferMinutes: data.bufferMinutes ?? 15,
      daysAhead: data.daysAhead ?? 14,
      minNoticeHours: data.minNoticeHours ?? 24,
      slotsInMessage: data.slotsInMessage ?? 6,
      workingHours: data.workingHours ?? DEFAULT_WORKING_HOURS,
      skipHolidays: data.skipHolidays ?? true,
      messageTemplate: data.messageTemplate ?? DEFAULT_MESSAGE_TEMPLATE,
      confirmationTemplate: data.confirmationTemplate ?? DEFAULT_CONFIRMATION_TEMPLATE,
      senderName: data.senderName ?? null,
      sendWindowStart: data.sendWindowStart ?? '09:00',
      sendWindowEnd: data.sendWindowEnd ?? '19:00',
      publicBaseUrl,
      createdById: user.id,
      createdByName: user.username || null,
    },
  });
  return getAutomation(created.id, user);
}

export async function updateAutomation(id: string, input: AutomationInput, user: SessionUser, publicBaseUrl: string | null) {
  const current = await getOwned(id, user);
  const data = sanitizeInput(input);
  if (input.whatsappId && input.whatsappId !== current.whatsappId) {
    await assertAccountAccess(user, input.whatsappId);
    data.whatsappId = input.whatsappId;
  }
  if (publicBaseUrl && !current.publicBaseUrl) data.publicBaseUrl = publicBaseUrl;
  await prisma.automation.update({ where: { id }, data });
  return getAutomation(id, user);
}

export async function setAutomationStatus(id: string, status: 'ACTIVE' | 'PAUSED', user: SessionUser) {
  const automation = await getOwned(id, user);
  if (status === 'ACTIVE') {
    const pending = await prisma.automationRecipient.count({ where: { automationId: id, status: 'PENDING' } });
    if (pending === 0) throw new AppError('Adicione destinatários antes de iniciar os envios', 400);
    const { slots, calendarError } = await availableSlots(automation, { bypassCache: true });
    if (calendarError) throw new AppError(`Não foi possível ler a agenda: ${calendarError}`, 400);
    if (slots.length === 0) throw new AppError('Não há horários livres com as regras atuais. Ajuste os horários de atendimento ou o período.', 400);
  }
  await prisma.automation.update({ where: { id }, data: { status, lastError: status === 'ACTIVE' ? null : automation.lastError } });
  return getAutomation(id, user);
}

export async function deleteAutomation(id: string, user: SessionUser) {
  await getOwned(id, user);
  await prisma.automation.delete({ where: { id } });
  return { id };
}

// ───────────────────────── Prévia e agendas ─────────────────────────

export async function previewAutomation(id: string, user: SessionUser) {
  const automation = await getOwned(id, user);
  const { slots, calendarStatus, calendarError } = await availableSlots(automation, { bypassCache: true });
  const sample = await prisma.automationRecipient.findFirst({ where: { automationId: id }, orderBy: { createdAt: 'asc' } });
  const message = finalMessage(automation, { name: sample?.name || 'Maria Silva', token: sample?.token || 'exemplo' }, slots);
  const calendars = (Array.isArray(automation.calendars) ? automation.calendars : []) as Array<{ id: string; name: string }>;
  return {
    serviceAccountEmail: serviceAccountEmail(),
    calendarError: calendarError || null,
    calendars: calendars.map(c => ({ ...c, ...(calendarStatus.find(s => s.id === c.id) || { ok: null }) })),
    totalSlots: slots.length,
    days: groupSlotsByDay(slots),
    message,
  };
}

function groupSlotsByDay(slots: Interval[]) {
  const days = new Map<string, { key: string; label: string; slots: Array<{ start: string; label: string }> }>();
  for (const s of slots) {
    const k = dayKey(s.start);
    if (!days.has(k)) days.set(k, { key: k, label: formatDateLong(s.start), slots: [] });
    days.get(k)!.slots.push({ start: new Date(s.start).toISOString(), label: formatTime(s.start) });
  }
  return Array.from(days.values());
}

export function automationMeta() {
  return {
    serviceAccountEmail: serviceAccountEmail(),
    presetCalendars: CAROL_CALENDARS,
    presetTargetCalendarId: CAROL_TARGET_CALENDAR,
    defaultWorkingHours: DEFAULT_WORKING_HOURS,
    defaultMessageTemplate: DEFAULT_MESSAGE_TEMPLATE,
    defaultConfirmationTemplate: DEFAULT_CONFIRMATION_TEMPLATE,
  };
}

// ───────────────────────── Destinatários ─────────────────────────

export async function listRecipients(id: string, user: SessionUser, status?: string) {
  await getOwned(id, user);
  const recipients = await prisma.automationRecipient.findMany({
    where: { automationId: id, ...(status ? { status } : {}) },
    orderBy: [{ createdAt: 'asc' }],
    take: 2000,
  });
  const bookings = await prisma.automationBooking.findMany({
    where: { automationId: id, status: 'CONFIRMED' },
    select: { recipientId: true, startAt: true },
  });
  const bookedBy = new Map(bookings.map(b => [b.recipientId, b.startAt]));
  return recipients.map(r => ({ ...r, token: undefined, bookedAt: bookedBy.get(r.id) || null }));
}

export async function addRecipients(
  id: string,
  items: Array<{ phone: string; name?: string | null }>,
  source: string,
  user: SessionUser,
) {
  await getOwned(id, user);
  let invalid = 0;
  let valid = 0;
  const unique = new Map<string, string | null>();
  for (const item of items.slice(0, 5000)) {
    const phone = normalizeBrPhone(item.phone);
    if (!phone) { invalid++; continue; }
    valid++;
    if (!unique.has(phone)) unique.set(phone, item.name?.trim() || null);
  }
  const existing = await prisma.automationRecipient.findMany({
    where: { automationId: id, phone: { in: Array.from(unique.keys()) } },
    select: { phone: true },
  });
  const existingSet = new Set(existing.map(e => e.phone));
  const toCreate = Array.from(unique.entries()).filter(([phone]) => !existingSet.has(phone));
  if (toCreate.length > 0) {
    await prisma.automationRecipient.createMany({
      data: toCreate.map(([phone, name]) => ({ automationId: id, phone, name, source: source.slice(0, 40), token: newToken() })),
      skipDuplicates: true,
    });
  }
  return { added: toCreate.length, duplicates: valid - toCreate.length, invalid };
}

export async function removeRecipient(id: string, recipientId: string, user: SessionUser) {
  await getOwned(id, user);
  const result = await prisma.automationRecipient.deleteMany({ where: { id: recipientId, automationId: id, status: { not: 'SENT' } } });
  if (result.count !== 1) throw new AppError('Só é possível remover quem ainda não recebeu a mensagem', 400);
  return { id: recipientId };
}

export async function retryFailedRecipients(id: string, user: SessionUser) {
  await getOwned(id, user);
  const result = await prisma.automationRecipient.updateMany({
    where: { automationId: id, status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, lastError: null },
  });
  return { requeued: result.count };
}

/** Contatos com uma etiqueta (conversas da conta da automação). */
export async function contactsByTag(whatsappId: string, tagId: string, user: SessionUser) {
  await assertAccountAccess(user, whatsappId);
  const rows = await prisma.conversationTag.findMany({
    where: { tagId, conversation: { whatsappId } },
    select: { conversation: { select: { contact: { select: { name: true, phone: true } } } } },
    take: 5000,
  });
  const map = new Map<string, { name: string | null; phone: string }>();
  for (const r of rows) {
    const c = r.conversation?.contact;
    if (!c || c.phone.includes('@')) continue;
    map.set(c.phone, { name: c.name, phone: c.phone });
  }
  return Array.from(map.values());
}

// ───────────────────────── Reuniões marcadas ─────────────────────────

export async function listBookings(id: string, user: SessionUser) {
  await getOwned(id, user);
  return prisma.automationBooking.findMany({
    where: { automationId: id },
    orderBy: [{ status: 'asc' }, { startAt: 'asc' }],
    take: 500,
  });
}

export async function cancelBookingByTeam(id: string, bookingId: string, user: SessionUser) {
  const automation = await getOwned(id, user);
  const booking = await prisma.automationBooking.findFirst({ where: { id: bookingId, automationId: id } });
  if (!booking) throw new AppError('Reunião não encontrada', 404);
  if (booking.status !== 'CONFIRMED') throw new AppError('Esta reunião já foi cancelada', 400);
  await prisma.automationBooking.update({ where: { id: bookingId }, data: { status: 'CANCELED', canceledBy: user.username || user.id } });
  if (booking.calendarEventId && automation.targetCalendarId) {
    deleteCalendarEvent(automation.targetCalendarId, booking.calendarEventId).catch(err =>
      logger.warn(`[Automação] Não removeu o evento ${booking.calendarEventId} da agenda: ${err?.message || err}`),
    );
  }
  return { id: bookingId };
}

// ───────────────────────── Página pública do cliente ─────────────────────────

async function recipientByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) throw new AppError('Link inválido', 404);
  const recipient = await prisma.automationRecipient.findUnique({ where: { token }, include: { automation: true } });
  if (!recipient) throw new AppError('Link inválido ou expirado', 404);
  return recipient;
}

export async function publicBookingInfo(token: string) {
  const recipient = await recipientByToken(token);
  const automation = recipient.automation;
  if (!recipient.openedAt) {
    prisma.automationRecipient.update({ where: { id: recipient.id }, data: { openedAt: new Date() } }).catch(() => {});
  }
  const current = await prisma.automationBooking.findFirst({
    where: { recipientId: recipient.id, status: 'CONFIRMED', startAt: { gt: new Date() } },
    orderBy: { startAt: 'asc' },
  });
  const { slots } = automation.bookingOpen
    ? await availableSlots(automation)
    : { slots: [] as Interval[] };
  return {
    firstName: firstName(recipient.name),
    meetingTitle: automation.meetingTitle,
    durationMinutes: automation.durationMinutes,
    bookingOpen: automation.bookingOpen,
    booking: current
      ? { start: current.startAt.toISOString(), dateLabel: formatDateLong(current.startAt.getTime()), timeLabel: formatTime(current.startAt.getTime()) }
      : null,
    days: groupSlotsByDay(slots),
  };
}

export async function publicBook(token: string, startIso: string) {
  const recipient = await recipientByToken(token);
  const automation = recipient.automation;
  if (!automation.bookingOpen) throw new AppError('Os agendamentos por este link foram encerrados. Responda a mensagem no WhatsApp para combinar um horário.', 410);

  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) throw new AppError('Horário inválido', 400);

  const previous = await prisma.automationBooking.findFirst({
    where: { recipientId: recipient.id, status: 'CONFIRMED', startAt: { gt: new Date() } },
  });
  if (previous && previous.startAt.getTime() === start) {
    return publicBookingInfo(token);
  }

  // Confere de novo, sem cache, se o horário continua livre (a agenda pode ter mudado).
  const { slots } = await availableSlots(automation, { bypassCache: true, ignoreBookingId: previous?.id });
  const slot = slots.find(s => s.start === start);
  if (!slot) throw new AppError('Este horário acabou de ser ocupado. Escolha outro, por favor.', 409);

  let booking;
  try {
    booking = await prisma.automationBooking.create({
      data: {
        automationId: automation.id,
        recipientId: recipient.id,
        phone: recipient.phone,
        name: recipient.name,
        startAt: new Date(slot.start),
        endAt: new Date(slot.end),
      },
    });
  } catch (err: any) {
    if (err?.code === 'P2002' || /unique|duplicate/i.test(String(err?.message))) {
      throw new AppError('Este horário acabou de ser reservado por outra pessoa. Escolha outro, por favor.', 409);
    }
    throw err;
  }

  if (previous) {
    await prisma.automationBooking.update({ where: { id: previous.id }, data: { status: 'CANCELED', canceledBy: 'cliente (troca de horário)' } });
    if (previous.calendarEventId && automation.targetCalendarId) {
      deleteCalendarEvent(automation.targetCalendarId, previous.calendarEventId).catch(() => {});
    }
  }

  afterBooking(automation, recipient, booking, !!previous).catch(err =>
    logger.warn(`[Automação] Pós-agendamento com aviso (${booking.id}): ${err?.message || err}`),
  );
  logger.info(`[Automação] ${automation.name}: reunião marcada para ${new Date(slot.start).toISOString()} (${recipient.phone}).`);
  return publicBookingInfo(token);
}

async function afterBooking(automation: any, recipient: any, booking: any, rescheduled: boolean) {
  const start = booking.startAt.getTime();
  const who = recipient.name || recipient.phone;

  // 1) Grava na agenda de destino (se a conta de serviço tiver permissão de edição)
  if (automation.targetCalendarId) {
    try {
      const eventId = await createCalendarEvent({
        calendarId: automation.targetCalendarId,
        summary: `${automation.meetingTitle} — ${who}`,
        description: `Marcado pelo cliente via Monteiro Conecta.\nTelefone/WhatsApp: +${recipient.phone}\nAutomação: ${automation.name}`,
        start: booking.startAt,
        end: booking.endAt,
      });
      await prisma.automationBooking.update({ where: { id: booking.id }, data: { calendarEventId: eventId, calendarError: null } });
    } catch (err: any) {
      await prisma.automationBooking.update({ where: { id: booking.id }, data: { calendarError: String(err?.message || err).slice(0, 300) } });
    }
  }

  // 2) Confirmação para o cliente no WhatsApp (aparece na conversa como uma mensagem normal)
  const session = sessionManager.getSession(automation.whatsappId);
  if (session?.status === 'CONNECTED') {
    const text = tidyGreeting(renderTemplate(automation.confirmationTemplate || DEFAULT_CONFIRMATION_TEMPLATE, {
      nome: recipient.name || '',
      primeiro_nome: firstName(recipient.name),
      data: formatDateLong(start),
      hora: formatTime(start),
      titulo: (automation.meetingTitle || 'reunião').toLowerCase(),
      link: bookingLink(automation, recipient.token),
    }));
    try {
      await sessionManager.sendMessage(automation.whatsappId, recipient.phone, text, 'text', undefined, undefined, undefined, automation.senderName || undefined);
    } catch (err: any) {
      logger.warn(`[Automação] Confirmação não enviada para ${recipient.phone}: ${err?.message || err}`);
    }
  }

  // 3) Aviso para a equipe com acesso a esta conta
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ role: 'admin' }, { whatsappAssignments: { some: { whatsappId: automation.whatsappId } } }],
    },
    select: { id: true },
  }).catch(() => [] as Array<{ id: string }>);
  for (const u of users) {
    sendPushToUser(u.id, {
      title: rescheduled ? 'Reunião remarcada pelo cliente 🔁' : 'Nova reunião marcada 📅',
      body: `${who} — ${formatDateShort(start)} às ${formatTime(start)} (${automation.meetingTitle})`,
      tag: `automation-booking-${booking.id}`,
      data: { url: `/automacoes/${automation.id}` },
    }).catch(() => {});
  }
}

// ───────────────────────── Envio em fila ─────────────────────────

const nextSendAt = new Map<string, number>();
let ticking = false;

function withinSendWindow(automation: { sendWindowStart: string; sendWindowEnd: string }, now: number): boolean {
  const p = brtParts(now);
  if (p.weekday === 0) return false; // domingo: não envia
  const minutes = p.hour * 60 + p.minute;
  return minutes >= hhmmToMinutes(automation.sendWindowStart) && minutes < hhmmToMinutes(automation.sendWindowEnd);
}

export async function processAutomationQueue(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const active = await prisma.automation.findMany({ where: { status: 'ACTIVE' } });
    const now = Date.now();
    for (const automation of active) {
      if (now < (nextSendAt.get(automation.id) || 0)) continue;
      if (!withinSendWindow(automation, now)) continue;
      if (sessionManager.getSession(automation.whatsappId)?.status !== 'CONNECTED') continue;

      const recipient = await prisma.automationRecipient.findFirst({
        where: { automationId: automation.id, status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });
      if (!recipient) {
        await prisma.automation.update({ where: { id: automation.id }, data: { status: 'PAUSED', lastError: null } });
        logger.info(`[Automação] ${automation.name}: todos os destinatários receberam a mensagem.`);
        continue;
      }

      const { slots, calendarError } = await availableSlots(automation);
      if (calendarError || slots.length === 0) {
        const reason = calendarError
          ? `Envios pausados: não foi possível ler a agenda (${calendarError}).`
          : 'Envios pausados: não há mais horários livres com as regras atuais.';
        await prisma.automation.update({ where: { id: automation.id }, data: { status: 'PAUSED', lastError: reason } });
        logger.warn(`[Automação] ${automation.name}: ${reason}`);
        continue;
      }

      const claimed = await prisma.automationRecipient.updateMany({
        where: { id: recipient.id, status: 'PENDING' },
        data: { status: 'SENDING', attempts: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;

      try {
        await sessionManager.sendMessage(
          automation.whatsappId, recipient.phone, finalMessage(automation, recipient, slots),
          'text', undefined, undefined, undefined, automation.senderName || undefined,
        );
        await prisma.automationRecipient.update({ where: { id: recipient.id }, data: { status: 'SENT', sentAt: new Date(), lastError: null } });
      } catch (err: any) {
        const message = String(err?.message || err || 'Falha ao enviar').slice(0, 300);
        const giveUp = recipient.attempts + 1 >= MAX_ATTEMPTS;
        await prisma.automationRecipient.update({
          where: { id: recipient.id },
          data: { status: giveUp ? 'FAILED' : 'PENDING', lastError: message },
        });
        logger.warn(`[Automação] Falha ao enviar para ${recipient.phone}: ${message}`);
      }
      nextSendAt.set(automation.id, Date.now() + MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
    }
  } catch (err: any) {
    logger.debug(`[Automação] Ciclo ignorado: ${err?.message || err}`);
  } finally {
    ticking = false;
  }
}

export function startAutomationWorker(): void {
  // Envio interrompido por reinício: não dá para saber se saiu, então não reenvia sozinho.
  setTimeout(() => {
    prisma.automationRecipient.updateMany({
      where: { status: 'SENDING' },
      data: { status: 'FAILED', lastError: 'Envio interrompido por reinício do servidor. Confira a conversa antes de reenviar.' },
    }).catch(() => {});
  }, 20_000).unref();
  setInterval(() => { processAutomationQueue(); }, WORKER_TICK_MS).unref();
  logger.info('Fila de automações iniciada.');
}
