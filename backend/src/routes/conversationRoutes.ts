import { Router } from 'express';
import { listConversations, getConversation, getConversationMessages, markConversationRead } from '../services/conversationService.js';
import { sendWhatsAppMessage } from '../services/whatsappService.js';
import { authMiddleware } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const whatsappId = req.query.whatsappId as string;
    if (!whatsappId) throw new AppError('whatsappId é obrigatório', 400);
    const result = await listConversations({
      whatsappId,
      search: req.query.search as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const conversation = await getConversation(req.params.id);
    res.json(conversation);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const result = await getConversationMessages(
      req.params.id,
      parseInt(req.query.page as string) || 1,
      parseInt(req.query.limit as string) || 50,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    await markConversationRead(req.params.id);
    res.json({ message: 'Marcada como lida' });
  } catch (err) {
    next(err);
  }
});

const sendSchema = z.object({
  to: z.string().min(1),
  content: z.string().min(1),
  type: z.string().optional(),
  mediaUrl: z.string().optional(),
});

router.post('/send', async (req, res, next) => {
  try {
    const body = sendSchema.parse(req.body);
    const accountId = req.body.accountId;
    if (!accountId) throw new AppError('accountId é obrigatório', 400);
    const result = await sendWhatsAppMessage(accountId, body.to, body.content, body.type, body.mediaUrl);
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

export default router;
