import { Router } from 'express';
import { getDashboardStats } from '../services/dashboardService.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/stats', async (req: AuthRequest, res, next) => {
  try { res.json(await getDashboardStats(req.user)); } catch (err) { next(err); }
});

export default router;
