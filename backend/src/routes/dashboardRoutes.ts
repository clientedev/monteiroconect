import { Router } from 'express';
import { getDashboardStats } from '../services/dashboardService.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { getTeamMoods, recordUserMood } from '../websocket/socketHandler.js';

const router = Router();
router.use(authMiddleware);

router.get('/stats', async (req: AuthRequest, res, next) => {
  try { res.json(await getDashboardStats(req.user)); } catch (err) { next(err); }
});

router.get('/moods', async (_req, res) => {
  res.json(getTeamMoods());
});

router.post('/moods', async (req: AuthRequest, res) => {
  try {
    const { moodId, moodLabel, emoji } = req.body;
    if (!moodId || !req.user) {
      return res.status(400).json({ error: 'moodId e usuario sao obrigatorios' });
    }
    const entry = {
      userId: String(req.user.id),
      username: req.user.username,
      moodId,
      moodLabel: moodLabel || moodId,
      emoji: emoji || '😊',
      updatedAt: new Date().toISOString(),
    };
    recordUserMood(entry);
    res.json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
