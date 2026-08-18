import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface LoginResult {
  token: string;
  user: { id: string; username: string; email: string; role: string };
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) {
    throw new AppError('Credenciais inválidas', 401);
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new AppError('Credenciais inválidas', 401);
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn } as jwt.SignOptions,
  );

  logger.info(`Login: ${user.username} (${user.role})`);
  return {
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  };
}

export async function createUser(
  username: string,
  email: string,
  password: string,
  role: string,
): Promise<{ id: string; username: string; email: string; role: string }> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) {
    throw new AppError('Usuário ou email já existe', 409);
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, email, password: hashed, role },
  });

  logger.info(`Usuário criado: ${username} (${role})`);
  return { id: user.id, username: user.username, email: user.email, role: user.role };
}

export async function ensureAdminExists(): Promise<void> {
  const count = await prisma.user.count();
  if (count === 0) {
    await createUser(env.adminUsername, env.adminEmail, env.adminPassword, 'admin');
    logger.info('Administrador inicial criado');
  }
}

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, username: true, email: true, role: true, isActive: true, createdAt: true,
      whatsappAssignments: { select: { whatsappId: true } }, },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateUser(id: string, data: { role?: string; isActive?: boolean }) {
  return prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, email: true, role: true, isActive: true },
  });
}

export async function deleteUser(id: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (user?.role === 'admin') {
    const adminCount = await prisma.user.count({ where: { role: 'admin' } });
    if (adminCount <= 1) {
      throw new AppError('Não é possível remover o último administrador', 400);
    }
  }
  await prisma.user.delete({ where: { id } });
}
