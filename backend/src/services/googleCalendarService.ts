import fs from 'node:fs';
import type { JWT } from 'google-auth-library';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Acesso às agendas do Google via conta de serviço (a mesma de GOOGLE_SERVICE_ACCOUNT_JSON).
 *
 * Para o sistema enxergar a disponibilidade, cada agenda precisa estar compartilhada com o
 * e-mail da conta de serviço. "Ver apenas livre/ocupado" já basta: o sistema só lê os
 * intervalos ocupados, nunca título ou descrição dos compromissos (protege eventos pessoais).
 * Para o sistema também gravar a reunião marcada, a agenda de destino precisa da permissão
 * "Fazer alterações nos eventos".
 *
 * Usa só o google-auth-library (já presente) + fetch na API REST, carregado sob demanda:
 * o pacote "googleapis" completo ocuparia dezenas de MB de RAM sem necessidade.
 */
export interface BusyInterval {
  start: number; // epoch ms
  end: number;
}

export interface CalendarAccessStatus {
  id: string;
  ok: boolean;
  error?: string;
}

let cachedCredentials: { client_email: string; private_key: string } | null | undefined;

function loadCredentials(): { client_email: string; private_key: string } | null {
  if (cachedCredentials !== undefined) return cachedCredentials;
  cachedCredentials = null;
  try {
    let raw = env.googleServiceAccountJson?.trim() || '';
    if (!raw && env.googleServiceAccountKeyPath && fs.existsSync(env.googleServiceAccountKeyPath)) {
      raw = fs.readFileSync(env.googleServiceAccountKeyPath, 'utf8');
    }
    if (!raw) return null;
    if (!raw.startsWith('{')) raw = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.client_email && parsed?.private_key) {
      cachedCredentials = {
        client_email: parsed.client_email,
        private_key: String(parsed.private_key).replace(/\\n/g, '\n'),
      };
    }
  } catch (err: any) {
    logger.warn(`[Agenda Google] Credencial da conta de serviço inválida: ${err?.message || err}`);
  }
  return cachedCredentials;
}

export function serviceAccountEmail(): string | null {
  return loadCredentials()?.client_email || null;
}

let jwtClient: JWT | null = null;
const API = 'https://www.googleapis.com/calendar/v3';

class GoogleApiError extends Error {
  constructor(message: string, public status: number, public reason?: string) {
    super(message);
  }
}

async function getJwt(): Promise<JWT> {
  if (jwtClient) return jwtClient;
  const creds = loadCredentials();
  if (!creds) throw new Error('Conta de serviço do Google não configurada (GOOGLE_SERVICE_ACCOUNT_JSON)');
  const { JWT: JWTClass } = await import('google-auth-library');
  jwtClient = new JWTClass({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return jwtClient;
}

async function googleRequest(method: string, path: string, body?: unknown): Promise<any> {
  const jwt = await getJwt();
  const { token } = await jwt.getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.status === 204) return null;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const reason = data?.error?.errors?.[0]?.reason || data?.error?.status;
      throw new GoogleApiError(data?.error?.message || `Google respondeu HTTP ${res.status}`, res.status, reason);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function describeGoogleError(err: any): string {
  const reason = err?.reason;
  const message = err?.message || String(err);
  if (reason === 'accessNotConfigured' || /has not been used|is disabled/i.test(message)) {
    return 'A API do Google Agenda não está ativada no projeto da conta de serviço.';
  }
  return message;
}

function translateCalendarError(reason?: string): string {
  if (reason === 'notFound') return 'Agenda não compartilhada com o sistema';
  if (reason === 'forbidden') return 'Sem permissão para ver esta agenda';
  return reason || 'Erro ao consultar a agenda';
}

const busyCache = new Map<string, { at: number; busy: BusyInterval[]; status: CalendarAccessStatus[] }>();
const CACHE_MS = 2 * 60 * 1000;

/** Intervalos ocupados (somados de todas as agendas) entre timeMin e timeMax. */
export async function getBusyIntervals(
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date,
  opts: { bypassCache?: boolean } = {},
): Promise<{ busy: BusyInterval[]; status: CalendarAccessStatus[] }> {
  const ids = Array.from(new Set(calendarIds.filter(Boolean)));
  if (ids.length === 0) return { busy: [], status: [] };

  const key = `${ids.sort().join('|')}#${Math.floor(timeMin.getTime() / 60000)}#${Math.floor(timeMax.getTime() / 60000)}`;
  const hit = busyCache.get(key);
  if (!opts.bypassCache && hit && Date.now() - hit.at < CACHE_MS) return { busy: hit.busy, status: hit.status };

  const busy: BusyInterval[] = [];
  const status: CalendarAccessStatus[] = [];

  // A API aceita até 50 agendas por consulta.
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    let data: any;
    try {
      data = await googleRequest('POST', '/freeBusy', {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        timeZone: 'America/Sao_Paulo',
        items: chunk.map(id => ({ id })),
      });
    } catch (err: any) {
      throw new Error(describeGoogleError(err));
    }
    for (const id of chunk) {
      const entry = data.calendars?.[id];
      const errors: any[] = entry?.errors || [];
      if (errors.length > 0) {
        status.push({ id, ok: false, error: translateCalendarError(errors[0]?.reason || undefined) });
        continue;
      }
      status.push({ id, ok: true });
      for (const period of (entry?.busy || []) as Array<{ start?: string; end?: string }>) {
        const start = Date.parse(period.start || '');
        const end = Date.parse(period.end || '');
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) busy.push({ start, end });
      }
    }
  }

  busyCache.set(key, { at: Date.now(), busy, status });
  if (busyCache.size > 50) busyCache.delete(busyCache.keys().next().value!);
  return { busy, status };
}

export function invalidateBusyCache(): void {
  busyCache.clear();
}

/** Cria a reunião na agenda de destino. Retorna o id do evento ou lança erro legível. */
export async function createCalendarEvent(input: {
  calendarId: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
}): Promise<string | null> {
  try {
    const data = await googleRequest('POST', `/calendars/${encodeURIComponent(input.calendarId)}/events`, {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.start.toISOString(), timeZone: 'America/Sao_Paulo' },
      end: { dateTime: input.end.toISOString(), timeZone: 'America/Sao_Paulo' },
    });
    invalidateBusyCache();
    return data?.id || null;
  } catch (err: any) {
    throw new Error(describeGoogleError(err));
  }
}

export async function deleteCalendarEvent(calendarId: string, eventId: string): Promise<void> {
  try {
    await googleRequest('DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  } catch (err: any) {
    const code = err?.status;
    if (code !== 404 && code !== 410) throw new Error(describeGoogleError(err));
  }
  invalidateBusyCache();
}
