import { prisma } from '../database/client.js';
import { AppError } from '../utils/errors.js';

export interface SessionUser { id: string; username?: string; role: string; }

export async function accessibleAccountIds(user: SessionUser): Promise<string[] | null> {
  if (user.role === 'admin') return null;
  const assignments = await prisma.whatsAppAssignment.findMany({
    where: { userId: user.id }, select: { whatsappId: true },
  });
  return assignments.map(a => a.whatsappId);
}

export async function assertAccountAccess(user: SessionUser, whatsappId: string): Promise<void> {
  if (user.role === 'admin') return;
  const assignment = await prisma.whatsAppAssignment.findUnique({
    where: { userId_whatsappId: { userId: user.id, whatsappId } }, select: { id: true },
  });
  if (!assignment) throw new AppError('Você não tem acesso a este WhatsApp', 403);
}

export async function setUserWhatsAppAssignments(userId: string, whatsappIds: string[]) {
  const uniqueIds = [...new Set(whatsappIds)];
  const count = await prisma.whatsAppAccount.count({ where: { id: { in: uniqueIds } } });
  if (count !== uniqueIds.length) throw new AppError('Uma ou mais contas não existem', 404);
  await prisma.$transaction([
    prisma.whatsAppAssignment.deleteMany({ where: { userId } }),
    ...uniqueIds.map(whatsappId => prisma.whatsAppAssignment.create({ data: { userId, whatsappId } })),
  ]);
}
