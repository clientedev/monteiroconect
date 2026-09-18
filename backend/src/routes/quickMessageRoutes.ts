import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../database/client.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { AppError } from '../utils/errors.js';

const router = Router();
router.use(authMiddleware);

function normalizeShortcut(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '') // Remove barras iniciais (/pix -> pix)
    .replace(/\s+/g, '-'); // Substitui espaços por hífens
}

const quickMessageSchema = z.object({
  title: z.string().trim().min(1, 'Título é obrigatório').max(100, 'Título muito longo'),
  shortcut: z.string().trim().min(1, 'Atalho é obrigatório').max(40, 'Atalho muito longo'),
  content: z.string().trim().min(1, 'Conteúdo é obrigatório'),
  category: z.string().trim().max(50, 'Categoria muito longa').optional().nullable(),
});

// Listar todas as mensagens rápidas (com busca opcional)
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

    const where: any = {};
    if (category) {
      where.category = category;
    }
    if (search) {
      const cleanSearch = search.replace(/^\/+/, '');
      where.OR = [
        { shortcut: { contains: cleanSearch, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    const messages = await prisma.quickMessage.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { shortcut: 'asc' },
      ],
    });

    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// Buscar mensagem rápida por ID
router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const message = await prisma.quickMessage.findUnique({
      where: { id },
    });
    if (!message) throw new AppError('Mensagem rápida não encontrada', 404);
    res.json(message);
  } catch (err) {
    next(err);
  }
});

// Criar nova mensagem rápida
router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const data = quickMessageSchema.parse(req.body);
    const shortcut = normalizeShortcut(data.shortcut);

    const existing = await prisma.quickMessage.findUnique({
      where: { shortcut },
    });
    if (existing) {
      throw new AppError(`O atalho "/${shortcut}" já está em uso por "${existing.title}"`, 400);
    }

    const created = await prisma.quickMessage.create({
      data: {
        title: data.title,
        shortcut,
        content: data.content,
        category: data.category || null,
      },
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Editar mensagem rápida existente
router.put('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const data = quickMessageSchema.parse(req.body);
    const shortcut = normalizeShortcut(data.shortcut);

    const current = await prisma.quickMessage.findUnique({
      where: { id },
    });
    if (!current) throw new AppError('Mensagem rápida não encontrada', 404);

    if (current.shortcut !== shortcut) {
      const existing = await prisma.quickMessage.findUnique({
        where: { shortcut },
      });
      if (existing && existing.id !== current.id) {
        throw new AppError(`O atalho "/${shortcut}" já está em uso por "${existing.title}"`, 400);
      }
    }

    const updated = await prisma.quickMessage.update({
      where: { id },
      data: {
        title: data.title,
        shortcut,
        content: data.content,
        category: data.category || null,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Excluir mensagem rápida
router.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const current = await prisma.quickMessage.findUnique({
      where: { id },
    });
    if (!current) throw new AppError('Mensagem rápida não encontrada', 404);

    await prisma.quickMessage.delete({
      where: { id },
    });

    res.json({ message: 'Mensagem rápida excluída com sucesso', id });
  } catch (err) {
    next(err);
  }
});

export default router;
