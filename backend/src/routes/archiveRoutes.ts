import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { archiveService } from '../services/archiveService.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

// Apenas administradores podem gerenciar alívio e otimização do banco de dados
const adminOnly = (req: AuthRequest, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return next(new AppError('Acesso restrito a administradores', 403));
  }
  next();
};

router.use(adminOnly);

/**
 * Consulta métricas e status de armazenamento do PostgreSQL
 */
router.get('/status', async (req, res, next) => {
  try {
    const stats = await archiveService.getArchiveStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

const cleanSchema = z.object({
  retentionDays: z.number().int().min(1).max(365).optional().default(5),
  preserveRecentPerConv: z.number().int().min(0).max(50).optional().default(1),
  logRetentionDays: z.number().int().min(1).max(90).optional(),
});

/**
 * Executa a rotina de economia de espaço do PostgreSQL (preservando últimos 5 dias)
 */
router.post(['/clean', '/relieve', '/backup-and-relieve'], async (req, res, next) => {
  try {
    const params = cleanSchema.parse(req.body || {});
    const result = await archiveService.cleanOldMessages(params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Endpoints de compatibilidade (sem Google Drive)
 */
router.post('/test-drive', (req, res) => {
  res.json({
    success: true,
    message: 'Google Drive desativado. O WhatsApp oficial conectado é o backup definitivo.',
  });
});

router.post('/sync', (req, res) => {
  res.json({ success: true, syncedCount: 0 });
});

/**
 * Reseta o lock de execução se a rotina tiver ficado presa
 */
router.post('/reset-lock', (req, res) => {
  const result = archiveService.resetLock();
  res.json(result);
});

export default router;
