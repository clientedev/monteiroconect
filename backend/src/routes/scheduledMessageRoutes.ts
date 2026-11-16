import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  listScheduledMessages,
  countPendingScheduledMessages,
  createScheduledMessage,
  updateScheduledMessage,
  cancelScheduledMessage,
  deleteScheduledMessage,
} from '../services/scheduledMessageService.js';

const router = Router();
router.use(authMiddleware);

const createSchema = z.object({
  accountId: z.string().min(1),
  to: z.string().min(1),
  contactName: z.string().max(200).nullable().optional(),
  content: z.string().min(1),
  scheduledAt: z.string().min(1),
  senderName: z.string().trim().max(50).nullable().optional(),
});

const updateSchema = z.object({
  content: z.string().min(1).optional(),
  scheduledAt: z.string().min(1).optional(),
  senderName: z.string().trim().max(50).nullable().optional(),
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const items = await listScheduledMessages(req.user!, {
      status: req.query.status as string | undefined,
      whatsappId: (req.query.whatsappId as string) || undefined,
      to: (req.query.to as string) || undefined,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get('/pending-count', async (req: AuthRequest, res, next) => {
  try {
    res.json({ count: await countPendingScheduledMessages(req.user!) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const body = createSchema.parse(req.body);
    res.status(201).json(await createScheduledMessage(body, req.user!));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const body = updateSchema.parse(req.body);
    res.json(await updateScheduledMessage(String(req.params.id), body, req.user!));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req: AuthRequest, res, next) => {
  try {
    res.json(await cancelScheduledMessage(String(req.params.id), req.user!));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    res.json(await deleteScheduledMessage(String(req.params.id), req.user!));
  } catch (err) {
    next(err);
  }
});

export default router;
