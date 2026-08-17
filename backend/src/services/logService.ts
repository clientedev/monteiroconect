import { prisma } from '../database/client.js';
import { logger } from '../utils/logger.js';

export async function createLog(
  level: string,
  message: string,
  source?: string,
  whatsappId?: string,
  metadata?: Record<string, unknown>,
) {
  const log = await prisma.systemLog.create({
    data: {
      level,
      message,
      source,
      whatsappId,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  // Also write to Winston
  const logFn = (logger as any)[level] || logger.info;
  logFn.call(logger, `[${source || 'system'}] ${message}`, metadata || '');

  return log;
}

export async function listLogs(opts: {
  level?: string;
  whatsappId?: string;
  page?: number;
  limit?: number;
}) {
  const { level, whatsappId, page = 1, limit = 100 } = opts;
  const skip = (page - 1) * limit;

  const where: any = {};
  if (level) where.level = level;
  if (whatsappId) where.whatsappId = whatsappId;

  const [total, logs] = await Promise.all([
    prisma.systemLog.count({ where }),
    prisma.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { whatsapp: { select: { name: true } } },
    }),
  ]);

  return { total, page, limit, logs };
}

export async function clearLogs(): Promise<number> {
  const result = await prisma.systemLog.deleteMany();
  return result.count;
}
