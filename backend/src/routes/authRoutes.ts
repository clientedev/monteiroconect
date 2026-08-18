import { Router } from 'express';
import { login, createUser, listUsers, updateUser, deleteUser } from '../services/authService.js';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import { z } from 'zod';
import { setUserWhatsAppAssignments } from '../services/accessService.js';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'supervisor', 'attendant']),
});

router.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await login(body.username, body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', authMiddleware, (req: AuthRequest, res) => {
  res.json(req.user);
});

router.post('/users', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const body = createUserSchema.parse(req.body);
    const user = await createUser(body.username, body.email, body.password, body.role);
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

router.get('/users', authMiddleware, async (_req, res, next) => {
  try {
    const users = await listUsers();
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const { role, isActive } = req.body;
    const user = await updateUser(String(req.params.id), { role, isActive });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id/whatsapps', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const { whatsappIds } = z.object({ whatsappIds: z.array(z.string()).max(100) }).parse(req.body);
    await setUserWhatsAppAssignments(String(req.params.id), whatsappIds);
    res.json({ message: 'Contas atribuídas' });
  } catch (err) { next(err); }
});

router.delete('/users/:id', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    await deleteUser(String(req.params.id));
    res.json({ message: 'Usuário removido' });
  } catch (err) {
    next(err);
  }
});

export default router;
