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
  userId: z.string().trim().optional().nullable(),
});

const userSelect = {
  id: true,
  username: true,
  role: true,
};

// Listar todas as mensagens rápidas (com busca e filtro de atendente opcionais)
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : undefined;

    const where: any = {};
    if (category) {
      where.category = category;
    }
    if (userId !== undefined) {
      if (userId === 'general' || userId === 'null' || userId === '') {
        where.userId = null;
      } else {
        where.userId = userId;
      }
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
      include: {
        user: { select: userSelect },
      },
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
      include: { user: { select: userSelect } },
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
    const targetUserId = data.userId || null;

    if (targetUserId) {
      const userExists = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!userExists) throw new AppError('Atendente selecionado não encontrado', 404);
    }

    const existing = await prisma.quickMessage.findFirst({
      where: {
        shortcut,
        userId: targetUserId,
      },
    });
    if (existing) {
      throw new AppError(`O atalho "/${shortcut}" já está em uso por "${existing.title}" neste contexto`, 400);
    }

    const created = await prisma.quickMessage.create({
      data: {
        title: data.title,
        shortcut,
        content: data.content,
        category: data.category || null,
        userId: targetUserId,
      },
      include: { user: { select: userSelect } },
    });

    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// Reatribuir mensagem rápida para outro atendente (ou Geral) via Drag & Drop
router.patch('/:id/assign', async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const { userId } = req.body;
    const targetUserId = (userId && userId !== 'general' && userId !== 'null') ? String(userId) : null;

    const current = await prisma.quickMessage.findUnique({ where: { id } });
    if (!current) throw new AppError('Mensagem rápida não encontrada', 404);

    if (targetUserId) {
      const userExists = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!userExists) throw new AppError('Atendente não encontrado', 404);
    }

    let finalShortcut = current.shortcut;
    const duplicate = await prisma.quickMessage.findFirst({
      where: {
        shortcut: finalShortcut,
        userId: targetUserId,
        id: { not: current.id },
      },
    });
    if (duplicate) {
      finalShortcut = `${current.shortcut}-${Date.now().toString().slice(-4)}`;
    }

    const updated = await prisma.quickMessage.update({
      where: { id },
      data: {
        userId: targetUserId,
        shortcut: finalShortcut,
      },
      include: { user: { select: userSelect } },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Clonar mensagem rápida para o usuário logado ou para um atendente selecionado
router.post('/:id/clone', async (req: AuthRequest, res, next) => {
  try {
    const id = String(req.params.id);
    const targetUserId = req.body?.targetUserId
      ? (req.body.targetUserId === 'general' ? null : String(req.body.targetUserId))
      : (req.user?.id || null);

    const source = await prisma.quickMessage.findUnique({ where: { id } });
    if (!source) throw new AppError('Mensagem rápida de origem não encontrada', 404);

    let cloneShortcut = source.shortcut;
    let counter = 1;
    while (await prisma.quickMessage.findFirst({ where: { shortcut: cloneShortcut, userId: targetUserId } })) {
      counter++;
      cloneShortcut = `${source.shortcut}-${counter}`;
    }

    const isSameOwner = source.userId === targetUserId;
    const cloneTitle = isSameOwner ? `${source.title} (Cópia)` : source.title;

    const cloned = await prisma.quickMessage.create({
      data: {
        title: cloneTitle,
        shortcut: cloneShortcut,
        content: source.content,
        category: source.category,
        userId: targetUserId,
      },
      include: { user: { select: userSelect } },
    });

    res.status(201).json(cloned);
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
    const targetUserId = data.userId !== undefined ? (data.userId || null) : undefined;

    const current = await prisma.quickMessage.findUnique({
      where: { id },
    });
    if (!current) throw new AppError('Mensagem rápida não encontrada', 404);

    const effectiveUserId = targetUserId !== undefined ? targetUserId : current.userId;

    const existing = await prisma.quickMessage.findFirst({
      where: {
        shortcut,
        userId: effectiveUserId,
        id: { not: current.id },
      },
    });
    if (existing) {
      throw new AppError(`O atalho "/${shortcut}" já está em uso por "${existing.title}"`, 400);
    }

    const updated = await prisma.quickMessage.update({
      where: { id },
      data: {
        title: data.title,
        shortcut,
        content: data.content,
        category: data.category || null,
        ...(targetUserId !== undefined ? { userId: targetUserId } : {}),
      },
      include: { user: { select: userSelect } },
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
