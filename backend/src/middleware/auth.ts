import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { AppError } from '../utils/errors.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    mustChangePassword?: boolean;
  };
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError('Token não fornecido', 401);
    }

    const token = header.slice(7);
    const decoded = jwt.verify(token, env.jwtSecret) as { id: string; username: string; role: string; mustChangePassword?: boolean };
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
    } else {
      next(new AppError('Token inválido ou expirado', 401));
    }
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new AppError('Acesso negado: permissão insuficiente', 403));
    } else {
      next();
    }
  };
}
