import { Router } from 'express';
import path from 'node:path';
import { promises as fs, createReadStream } from 'node:fs';
import { env } from '../config/env.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { listConversations, getConversation, getConversationMessages, markConversationRead, assignConversation, setConversationAiEnabled, setConversationMuted, cleanupDuplicateConversations } from '../services/conversationService.js';
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
  quotedMessageId: z.string().optional(),
  quotedContent: z.string().optional(),
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
      body.quotedMessageId,
      body.quotedContent,
    );
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

// Download de arquivo de mídia com cabeçalhos adequados e recuperação sob demanda
router.get('/media/download', async (req, res, next) => {
  try {
    const rawUrl = (req.query.url as string) || '';
    const requestedName = (req.query.filename as string) || 'documento';
    if (!rawUrl || !rawUrl.startsWith('/uploads/')) {
      throw new AppError('URL de mídia inválida', 400);
    }

    const safeFilename = path.basename(rawUrl.slice('/uploads/'.length));
    const uploadDir = path.resolve(env.uploadPath);
    const filePath = path.join(uploadDir, safeFilename);

    let finalPath = filePath;
    let finalOriginalName = requestedName;

    try {
      await fs.access(filePath);
    } catch {
      // Tenta recuperar via Baileys / WhatsApp MMS
      const recovered = await sessionManager.recoverMediaFile(safeFilename);
      if (!recovered) {
        throw new AppError('Arquivo não encontrado no servidor ou expirado no WhatsApp', 404);
      }
      finalPath = recovered.filePath;
      if (recovered.originalName) finalOriginalName = recovered.originalName;
    }

    const ext = path.extname(finalOriginalName).toLowerCase() || path.extname(safeFilename).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.zip': 'application/zip',
      '.rar': 'application/vnd.rar',
      '.txt': 'text/plain; charset=utf-8',
      '.csv': 'text/csv; charset=utf-8',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    const safeHeader = finalOriginalName.replace(/[^\w\s.-]/gi, '_');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeHeader}"; filename*=UTF-8''${encodeURIComponent(finalOriginalName)}`);

    const stream = createReadStream(finalPath);
    stream.pipe(res);
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

router.put('/:id/ai', async (req: AuthRequest, res, next) => {
  try {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
    const result = await setConversationAiEnabled(String(req.params.id), enabled, req.user!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/mute', async (req: AuthRequest, res, next) => {
  try {
    const { muted } = z.object({ muted: z.boolean() }).parse(req.body);
    const result = await setConversationMuted(String(req.params.id), muted, req.user!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/cleanup-duplicates', async (req: AuthRequest, res, next) => {
  try {
    const { whatsappId } = z.object({ whatsappId: z.string().min(1) }).parse(req.body);
    const result = await cleanupDuplicateConversations(whatsappId, req.user!);
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
