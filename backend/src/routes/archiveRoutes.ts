import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { archiveService } from '../services/archiveService.js';
import { googleDriveService } from '../services/googleDriveService.js';
import { AppError } from '../utils/errors.js';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);

// Apenas administradores podem gerenciar backups e alívio do banco de dados
const adminOnly = (req: AuthRequest, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return next(new AppError('Acesso restrito a administradores', 403));
  }
  next();
};

router.use(adminOnly);

/**
 * Consulta status do arquivo, estatísticas e conexão com Google Drive
 */
router.get('/status', async (req, res, next) => {
  try {
    const stats = await archiveService.getArchiveStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

/**
 * Executa o teste de conexão com a pasta do Google Drive
 */
router.post('/test-drive', async (req, res, next) => {
  try {
    const result = await googleDriveService.testConnection();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const relieveSchema = z.object({
  keepCount: z.number().int().min(10).max(500).optional(),
  logRetentionDays: z.number().int().min(1).max(90).optional(),
});

/**
 * Dispara manualmente a rotina de alívio do PostgreSQL
 */
router.post('/relieve', async (req, res, next) => {
  try {
    const params = relieveSchema.parse(req.body || {});
    const result = await archiveService.relieveDatabase(params);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Sincroniza arquivos pendentes com o Google Drive
 */
router.post('/sync', async (req, res, next) => {
  try {
    const synced = await archiveService.syncPendingToDrive();
    res.json({ success: true, syncedCount: synced });
  } catch (err) {
    next(err);
  }
});

export default router;
