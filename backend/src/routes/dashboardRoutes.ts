import { Router } from 'express';
import { getDashboardStats } from '../services/dashboardService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/stats', async (_req, res, next) => {
  try { res.json(await getDashboardStats()); } catch (err) { next(err); }
});

export default router;
