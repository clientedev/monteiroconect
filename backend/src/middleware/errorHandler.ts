import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { ZodError } from 'zod';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    logger.warn(`AppError ${err.statusCode}: ${err.message}`);
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Dados inválidos',
      details: err.issues.map(issue => ({
        path: issue.path,
        message: issue.message,
      })),
    });
    return;
  }

  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: env.nodeEnv === 'development' ? err.message : undefined,
  });
}

import { env } from '../config/env.js';
