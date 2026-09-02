import { Router } from 'express';
import {
  createWhatsAppAccount,
  listWhatsAppAccounts,
  getWhatsAppAccount,
  disconnectWhatsApp,
  removeWhatsApp,
  refreshQRCode,
  syncWhatsApp,
  getWhatsAppSyncProgress,
} from '../services/whatsappService.js';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

router.use(authMiddleware);

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const accounts = await listWhatsAppAccounts(req.user!);
    res.json(accounts);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const account = await getWhatsAppAccount(String(req.params.id), req.user!);
    res.json(account);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const { name } = createSchema.parse(req.body);
    const account = await createWhatsAppAccount(name, req.user!);
    res.status(201).json(account);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/disconnect', async (req: AuthRequest, res, next) => {
  try {
    await disconnectWhatsApp(String(req.params.id), req.user!);
    res.json({ message: 'Desconectado' });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req: AuthRequest, res, next) => {
  try {
    await removeWhatsApp(String(req.params.id), req.user!);
    res.json({ message: 'WhatsApp e todo o histórico removidos com sucesso' });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/refresh-qr', async (req: AuthRequest, res, next) => {
  try {
    const { qrCode } = await refreshQRCode(String(req.params.id), req.user!);
    res.json({ qrCode });
  } catch (err) {
    next(err);
  }
});

// Ressincronização manual: contatos (nomes/LID) + recarrega listas no frontend
router.post('/:id/sync', async (req: AuthRequest, res, next) => {
  try {
    const result = await syncWhatsApp(String(req.params.id), req.user!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/sync-progress', async (req: AuthRequest, res, next) => {
  try {
    const progress = await getWhatsAppSyncProgress(String(req.params.id), req.user!);
    res.json(progress);
  } catch (err) {
    next(err);
  }
});

export default router;
