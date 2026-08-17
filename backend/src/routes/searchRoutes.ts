import { Router } from 'express';
import { globalSearch } from '../services/searchService.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const q = req.query.q as string;
    res.json(await globalSearch(q));
  } catch (err) { next(err); }
});

export default router;
