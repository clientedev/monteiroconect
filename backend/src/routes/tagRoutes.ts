import { Router } from 'express';
import { listTags, createTag, updateTag, deleteTag, addTagToConversation, removeTagFromConversation } from '../services/tagService.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req, res, next) => {
  try { res.json(await listTags()); } catch (err) { next(err); }
});

router.post('/', requireRole('admin', 'supervisor'), async (req, res, next) => {
  try {
    const { name, color } = z.object({ name: z.string(), color: z.string().default('#3B82F6') }).parse(req.body);
    const tag = await createTag(name, color);
    res.status(201).json(tag);
  } catch (err) { next(err); }
});

router.put('/:id', requireRole('admin', 'supervisor'), async (req, res, next) => {
  try {
    const body = z.object({ name: z.string().optional(), color: z.string().optional() }).parse(req.body);
    const tag = await updateTag(String(req.params.id), body);
    res.json(tag);
  } catch (err) { next(err); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try { res.json(await deleteTag(String(req.params.id))); } catch (err) { next(err); }
});

router.post('/conversation', async (req, res, next) => {
  try {
    const { conversationId, tagId } = z.object({
      conversationId: z.string(), tagId: z.string(),
    }).parse(req.body);
    res.json(await addTagToConversation(conversationId, tagId));
  } catch (err) { next(err); }
});

router.delete('/conversation', async (req, res, next) => {
  try {
    const conversationId = String(req.query.conversationId);
    const tagId = String(req.query.tagId);
    res.json(await removeTagFromConversation(conversationId, tagId));
  } catch (err) { next(err); }
});

export default router;
