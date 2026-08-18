import { Router } from 'express';
import { listContacts, updateContact } from '../services/contactService.js';
import { authMiddleware } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const whatsappId = req.query.whatsappId as string;
    if (!whatsappId) throw new Error('whatsappId é obrigatório');
    const result = await listContacts({
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

router.put('/:id', async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().trim().max(120).optional(),
      notes: z.string().max(5000).optional(),
      leadStatus: z.enum(['NEW', 'QUALIFIED', 'NEGOTIATION', 'WON', 'LOST']).optional(),
      leadValue: z.number().nonnegative().nullable().optional(),
      leadSource: z.string().trim().max(120).optional(),
    }).parse(req.body);
    const contact = await updateContact(req.params.id, body);
    res.json(contact);
  } catch (err) {
    next(err);
  }
});

export default router;
