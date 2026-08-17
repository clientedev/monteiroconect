import winston from 'winston';
import path from 'node:path';
import { env } from '../config/env.js';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]: ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: env.logLevel,
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    new winston.transports.Console({ format: combine(colorize(), logFormat) }),
    new winston.transports.File({
      filename: path.join(env.logPath, 'app.log'),
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(env.logPath, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});
