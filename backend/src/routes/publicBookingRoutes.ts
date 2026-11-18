import { Router } from 'express';
import { z } from 'zod';
import { publicBook, publicBookingInfo } from '../services/automationService.js';

/** Rotas abertas (sem login) usadas pela página que o cliente abre pelo link da mensagem. */
const router = Router();

const hits = new Map<string, { count: number; resetAt: number }>();
router.use((req, res, next) => {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt < now) {
    hits.set(ip, { count: 1, resetAt: now + 60_000 });
    if (hits.size > 5000) hits.clear();
    return next();
  }
  entry.count++;
  if (entry.count > 60) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um minuto e tente de novo.' });
  next();
});

router.get('/:token', async (req, res, next) => {
  try {
    res.json(await publicBookingInfo(String(req.params.token)));
  } catch (err) {
    next(err);
  }
});

router.post('/:token', async (req, res, next) => {
  try {
    const body = z.object({ start: z.string().min(10) }).parse(req.body);
    res.json(await publicBook(String(req.params.token), body.start));
  } catch (err) {
    next(err);
  }
});

export default router;
