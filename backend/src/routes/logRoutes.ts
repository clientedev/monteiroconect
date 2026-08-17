import { Router } from 'express';
import { listLogs, clearLogs } from '../services/logService.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const result = await listLogs({
      level: req.query.level as string,
      whatsappId: req.query.whatsappId as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 100,
    });
    res.json(result);
  } catch (err) { next(err); }
});

router.delete('/', requireRole('admin'), async (_req, res, next) => {
  try {
    const count = await clearLogs();
    res.json({ message: `${count} logs removidos` });
  } catch (err) { next(err); }
});

export default router;
