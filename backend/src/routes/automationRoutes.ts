import { Router, Request } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  addRecipients,
  automationMeta,
  cancelBookingByTeam,
  contactsByTag,
  createAutomation,
  deleteAutomation,
  getAutomation,
  listAutomations,
  listBookings,
  listRecipients,
  previewAutomation,
  removeRecipient,
  retryFailedRecipients,
  setAutomationStatus,
  updateAutomation,
} from '../services/automationService.js';
import { listCrmClientsByInsurer, listCrmInsurers } from '../services/crmService.js';
import { AppError } from '../utils/errors.js';

const router = Router();
router.use(authMiddleware);

/** Endereço público do sistema (para montar o link que vai na mensagem). */
export function publicBaseUrlFrom(req: Request): string | null {
  const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
  if (!host || /^(localhost|127\.|0\.0\.0\.0)/.test(host)) return null;
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return `${proto === 'http' && !host.includes('localhost') ? 'https' : proto}://${host}`;
}

const windowSchema = z.tuple([z.string(), z.string()]);
const automationSchema = z.object({
  name: z.string().max(120).optional(),
  whatsappId: z.string().optional(),
  calendars: z.array(z.object({ id: z.string(), name: z.string().optional() })).max(50).optional(),
  targetCalendarId: z.string().nullable().optional(),
  meetingTitle: z.string().max(80).optional(),
  durationMinutes: z.number().optional(),
  bufferMinutes: z.number().optional(),
  daysAhead: z.number().optional(),
  minNoticeHours: z.number().optional(),
  slotsInMessage: z.number().optional(),
  workingHours: z.record(z.array(windowSchema)).optional(),
  skipHolidays: z.boolean().optional(),
  messageTemplate: z.string().max(3000).optional(),
  confirmationTemplate: z.string().max(1500).optional(),
  senderName: z.string().max(50).nullable().optional(),
  sendWindowStart: z.string().optional(),
  sendWindowEnd: z.string().optional(),
  bookingOpen: z.boolean().optional(),
});

const recipientsSchema = z.object({
  source: z.string().max(40).default('manual'),
  items: z.array(z.object({ phone: z.string(), name: z.string().nullable().optional() })).min(1).max(5000),
});

const wrap = (fn: (req: AuthRequest) => Promise<unknown>) => async (req: AuthRequest, res: any, next: any) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    next(err);
  }
};

router.get('/meta', wrap(async () => automationMeta()));

router.get('/crm/insurers', wrap(async () => {
  try {
    return await listCrmInsurers();
  } catch (err: any) {
    throw new AppError(`Não foi possível consultar o CRM: ${err?.message || err}`, 502);
  }
}));

router.get('/crm/clients', wrap(async req => {
  const insurer = String(req.query.insurer || '').trim();
  if (insurer.length < 2) throw new AppError('Informe a seguradora', 400);
  try {
    return await listCrmClientsByInsurer(insurer);
  } catch (err: any) {
    throw new AppError(`Não foi possível consultar o CRM: ${err?.message || err}`, 502);
  }
}));

router.get('/tag-contacts', wrap(async req => {
  const whatsappId = String(req.query.whatsappId || '');
  const tagId = String(req.query.tagId || '');
  if (!whatsappId || !tagId) throw new AppError('Informe a conta e a etiqueta', 400);
  return contactsByTag(whatsappId, tagId, req.user!);
}));

router.get('/', wrap(async req => listAutomations(req.user!)));
router.post('/', async (req: AuthRequest, res, next) => {
  try {
    res.status(201).json(await createAutomation(automationSchema.parse(req.body), req.user!, publicBaseUrlFrom(req)));
  } catch (err) {
    next(err);
  }
});
router.get('/:id', wrap(async req => getAutomation(String(req.params.id), req.user!)));
router.put('/:id', wrap(async req => updateAutomation(String(req.params.id), automationSchema.parse(req.body), req.user!, publicBaseUrlFrom(req))));
router.delete('/:id', wrap(async req => deleteAutomation(String(req.params.id), req.user!)));
router.post('/:id/start', wrap(async req => setAutomationStatus(String(req.params.id), 'ACTIVE', req.user!)));
router.post('/:id/pause', wrap(async req => setAutomationStatus(String(req.params.id), 'PAUSED', req.user!)));
router.get('/:id/preview', wrap(async req => previewAutomation(String(req.params.id), req.user!)));

router.get('/:id/recipients', wrap(async req => listRecipients(String(req.params.id), req.user!, (req.query.status as string) || undefined)));
router.post('/:id/recipients', wrap(async req => {
  const body = recipientsSchema.parse(req.body);
  return addRecipients(String(req.params.id), body.items, body.source, req.user!);
}));
router.post('/:id/recipients/retry-failed', wrap(async req => retryFailedRecipients(String(req.params.id), req.user!)));
router.delete('/:id/recipients/:recipientId', wrap(async req => removeRecipient(String(req.params.id), String(req.params.recipientId), req.user!)));

router.get('/:id/bookings', wrap(async req => listBookings(String(req.params.id), req.user!)));
router.post('/:id/bookings/:bookingId/cancel', wrap(async req => cancelBookingByTeam(String(req.params.id), String(req.params.bookingId), req.user!)));

export default router;
