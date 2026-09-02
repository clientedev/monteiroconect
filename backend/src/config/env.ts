import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const env = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'http://localhost:5173'),
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  jwtSecret: process.env.JWT_SECRET || process.env.SESSION_SECRET || 'monteiro-conecta-change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  sessionsPath: process.env.SESSIONS_PATH || './sessions',
  maxReconnectAttempts: parseInt(process.env.MAX_RECONNECT_ATTEMPTS || '100', 10),
  reconnectInitialDelay: parseInt(process.env.RECONNECT_INITIAL_DELAY || '5000', 10),
  reconnectMaxDelay: parseInt(process.env.RECONNECT_MAX_DELAY || '60000', 10),
  historyMessageLimit: parseInt(process.env.HISTORY_MESSAGE_LIMIT || '0', 10),
  // 0 = sem limite. Use variável de ambiente para restringir se necessário.
  historySyncDays: parseInt(process.env.HISTORY_SYNC_DAYS || '365', 10),
  uploadPath: process.env.UPLOAD_PATH || './uploads',
  maxUploadSize: process.env.MAX_UPLOAD_SIZE || '50MB',
  logLevel: process.env.LOG_LEVEL || 'info',
  logPath: process.env.LOG_PATH || './logs',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@2026!',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@monteiroconecta.local',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiBaseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
} as const;
