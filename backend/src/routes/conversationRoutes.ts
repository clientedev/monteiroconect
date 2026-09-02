import { Router } from 'express';
import { listConversations, getConversation, getConversationMessages, markConversationRead, assignConversation } from '../services/conversationService.js';
import { sendWhatsAppMessage, broadcastWhatsAppMessages } from '../services/whatsappService.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

// List conversations
router.get('/', async (req, res, next) => {
  try {
    const whatsappId = req.query.whatsappId as string;
    if (!whatsappId) throw new AppError('whatsappId é obrigatório', 400);
    const result = await listConversations({
      whatsappId,
      search: req.query.search as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      includeGroups: req.query.includeGroups !== 'false',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Send message — ANTES de rotas com /:id para não ser interceptado
const sendSchema = z.object({
  accountId: z.string().min(1),
  to: z.string().min(1),
  content: z.string().optional().default(''),
  type: z.string().optional().default('text'),
  mediaUrl: z.string().optional(),
  mediaMimeType: z.string().max(200).optional(),
  mediaFileName: z.string().max(255).optional(),
  senderName: z.string().trim().min(1).max(50).optional(),
}).refine(v => v.content.length > 0 || !!v.mediaUrl, {
  message: 'content ou mediaUrl é obrigatório',
});

router.post('/send', async (req: AuthRequest, res, next) => {
  try {
    const body = sendSchema.parse(req.body);
    const result = await sendWhatsAppMessage(
      body.accountId,
      body.to,
      body.content,
      body.type,
      body.mediaUrl,
      body.mediaMimeType,
      body.mediaFileName,
      req.user!,
      body.senderName,
    );
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

const broadcastSchema = z.object({
  accountId: z.string().min(1),
  recipients: z.array(z.string().min(1)).min(1).max(500),
  content: z.string().optional().default(''),
  type: z.string().optional().default('text'),
  mediaUrl: z.string().optional(),
  mediaMimeType: z.string().max(200).optional(),
  mediaFileName: z.string().max(255).optional(),
}).refine(v => v.content.length > 0 || !!v.mediaUrl, {
  message: 'content ou mediaUrl é obrigatório',
});

router.post('/broadcast', async (req: AuthRequest, res, next) => {
  try {
    const body = broadcastSchema.parse(req.body);
    const result = await broadcastWhatsAppMessages(body, req.user!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/assignment', async (req: AuthRequest, res, next) => {
  try {
    const { userId } = z.object({ userId: z.string().nullable() }).parse(req.body);
    const result = await assignConversation(String(req.params.id), userId, req.user!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get conversation by ID
router.get('/:id', async (req, res, next) => {
  try {
    const conversation = await getConversation(req.params.id);
    res.json(conversation);
  } catch (err) {
    next(err);
  }
});

// Get messages
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

// Mark as read
router.post('/:id/read', async (req, res, next) => {
  try {
    await markConversationRead(req.params.id);
    res.json({ message: 'Marcada como lida' });
  } catch (err) {
    next(err);
  }
});

export default router;
