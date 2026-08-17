import { Router } from 'express';
import {
  createWhatsAppAccount,
  listWhatsAppAccounts,
  getWhatsAppAccount,
  disconnectWhatsApp,
  removeWhatsApp,
  refreshQRCode,
} from '../services/whatsappService.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

router.use(authMiddleware);

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

router.get('/', async (_req, res, next) => {
  try {
    const accounts = await listWhatsAppAccounts();
    res.json(accounts);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const account = await getWhatsAppAccount(String(req.params.id));
    res.json(account);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('admin', 'supervisor'), async (req, res, next) => {
  try {
    const { name } = createSchema.parse(req.body);
    const account = await createWhatsAppAccount(name);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/disconnect', requireRole('admin'), async (req, res, next) => {
  try {
    await disconnectWhatsApp(String(req.params.id));
    res.json({ message: 'Desconectado' });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    await removeWhatsApp(String(req.params.id));
    res.json({ message: 'Removido' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/refresh-qr', async (req, res, next) => {
  try {
    const { qrCode } = await refreshQRCode(String(req.params.id));
    res.json({ qrCode });
  } catch (err) {
    next(err);
  }
});

export default router;
