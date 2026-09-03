import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface LoginResult {
  token: string;
  user: { id: string; username: string; email: string; role: string; mustChangePassword: boolean };
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
    { id: user.id, username: user.username, role: user.role, mustChangePassword: user.mustChangePassword },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn } as jwt.SignOptions,
  );

  logger.info(`Login: ${user.username} (${user.role})`);
  return {
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword },
  };
}

export async function createUser(
  username: string,
  email: string,
  password: string,
  role: string,
): Promise<{ id: string; username: string; email: string; role: string; mustChangePassword: boolean }> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email }] },
  });
  if (existing) {
    throw new AppError('Usuário ou email já existe', 409);
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { username, email, password: hashed, role, mustChangePassword: true },
  });

  logger.info(`Usuário criado: ${username} (${role})`);
  return { id: user.id, username: user.username, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
}

export async function ensureAdminExists(): Promise<void> {
  const count = await prisma.user.count();
  if (count === 0) {
    const hashed = await bcrypt.hash(env.adminPassword, 12);
    await prisma.user.create({
      data: {
        username: env.adminUsername,
        email: env.adminEmail,
        password: hashed,
        role: 'admin',
        mustChangePassword: false,
      },
    });
    logger.info('Administrador inicial criado');
  }
}

export async function listUsers() {
  return prisma.user.findMany({
    select: { id: true, username: true, email: true, role: true, isActive: true, mustChangePassword: true, createdAt: true,
      whatsappAssignments: { select: { whatsappId: true } }, },
    orderBy: { createdAt: 'asc' },
  });
}

export async function updateUser(id: string, data: { role?: string; isActive?: boolean }) {
  return prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, email: true, role: true, isActive: true, mustChangePassword: true },
  });
}

export async function resetPassword(userId: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 6) {
    throw new AppError('A senha deve ter no mínimo 6 caracteres', 400);
  }
  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashed,
      mustChangePassword: true,
    },
  });
  logger.info(`Senha resetada pelo admin para o usuário ID: ${userId}`);
}

export async function changePassword(userId: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 6) {
    throw new AppError('A senha deve ter no mínimo 6 caracteres', 400);
  }
  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: hashed,
      mustChangePassword: false,
    },
  });
  logger.info(`Senha alterada pelo usuário ID: ${userId}`);
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
