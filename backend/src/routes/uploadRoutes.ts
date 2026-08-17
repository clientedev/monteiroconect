import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { env } from '../config/env.js';
import { authMiddleware } from '../middleware/auth.js';
import { randomUUID } from 'node:crypto';

const router = Router();
router.use(authMiddleware);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.uploadPath);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  res.json({
    url: `/uploads/${req.file.filename}`,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
});

export default router;
