/**
 * Cálculo de horários livres (funções puras, sem banco nem rede — fáceis de testar).
 *
 * Fuso: America/Sao_Paulo. O Brasil não tem horário de verão desde 2019, então o deslocamento
 * fixo de -03:00 é exato. Datas "locais" são tratadas como dia/hora no relógio de Brasília.
 */
export const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

export type WorkingHours = Record<string, Array<[string, string]>>;

export interface Interval {
  start: number;
  end: number;
}

export interface AvailabilityRules {
  workingHours: WorkingHours;
  durationMinutes: number;
  bufferMinutes: number;
  daysAhead: number;
  minNoticeHours: number;
  skipHolidays: boolean;
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  '1': [['09:00', '12:00'], ['13:30', '18:00']],
  '2': [['09:00', '12:00'], ['13:30', '18:00']],
  '3': [['09:00', '12:00'], ['13:30', '18:00']],
  '4': [['09:00', '12:00'], ['13:30', '18:00']],
  '5': [['09:00', '12:00'], ['13:30', '18:00']],
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Partes da data no relógio de Brasília. */
export function brtParts(epoch: number) {
  const d = new Date(epoch + BRT_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

/** Epoch (ms) de um horário local de Brasília. */
export function brtEpoch(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour, minute) - BRT_OFFSET_MS;
}

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

function easterSunday(year: number): { month: number; day: number } {
  // Algoritmo de Meeus/Jones/Butcher
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

const holidayCache = new Map<number, Set<string>>();

/** Feriados nacionais (incluindo Carnaval e Corpus Christi, que param o comércio). */
export function nationalHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const key = (m: number, d: number) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const set = new Set<string>([
    key(1, 1), key(4, 21), key(5, 1), key(9, 7), key(10, 12), key(11, 2), key(11, 15), key(11, 20), key(12, 25),
  ]);
  const easter = easterSunday(year);
  const easterUtc = Date.UTC(year, easter.month - 1, easter.day);
  for (const offset of [-48, -47, -2, 60]) {
    const d = new Date(easterUtc + offset * DAY_MS);
    set.add(key(d.getUTCMonth() + 1, d.getUTCDate()));
  }
  holidayCache.set(year, set);
  return set;
}

export function isHoliday(epoch: number): boolean {
  const p = brtParts(epoch);
  const key = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return nationalHolidays(p.year).has(key);
}

/** Período a consultar nas agendas para as regras dadas. */
export function availabilityRange(rules: AvailabilityRules, now: number): { from: number; to: number } {
  const today = brtParts(now);
  const from = brtEpoch(today.year, today.month, today.day);
  const to = from + (Math.max(1, rules.daysAhead) + 1) * DAY_MS;
  return { from, to };
}

/**
 * Horários livres: janelas de atendimento menos compromissos (com folga antes/depois),
 * menos reuniões já marcadas, respeitando a antecedência mínima e os feriados.
 */
export function computeFreeSlots(rules: AvailabilityRules, busy: Interval[], now: number): Interval[] {
  const duration = Math.max(10, Math.min(240, Math.round(rules.durationMinutes || 30))) * 60_000;
  const buffer = Math.max(0, Math.min(120, Math.round(rules.bufferMinutes || 0))) * 60_000;
  const step = Math.min(duration, 60 * 60_000) >= 30 * 60_000 ? 30 * 60_000 : 15 * 60_000;
  const earliest = now + Math.max(0, rules.minNoticeHours || 0) * 60 * 60_000;
  const sortedBusy = [...busy].sort((a, b) => a.start - b.start);
  const { from } = availabilityRange(rules, now);
  const slots: Interval[] = [];

  for (let dayIndex = 0; dayIndex <= Math.max(1, rules.daysAhead); dayIndex++) {
    const dayStart = from + dayIndex * DAY_MS;
    const parts = brtParts(dayStart + 12 * 60 * 60_000);
    if (rules.skipHolidays && isHoliday(dayStart + 12 * 60 * 60_000)) continue;
    const windows = rules.workingHours?.[String(parts.weekday)] || [];
    for (const [startText, endText] of windows) {
      const startMin = parseHHMM(startText);
      const endMin = parseHHMM(endText);
      if (startMin === null || endMin === null || endMin <= startMin) continue;
      const windowStart = brtEpoch(parts.year, parts.month, parts.day) + startMin * 60_000;
      const windowEnd = brtEpoch(parts.year, parts.month, parts.day) + endMin * 60_000;
      for (let t = windowStart; t + duration <= windowEnd; t += step) {
        if (t < earliest) continue;
        const blockedFrom = t - buffer;
        const blockedTo = t + duration + buffer;
        const conflict = sortedBusy.some(b => b.start < blockedTo && b.end > blockedFrom);
        if (!conflict) slots.push({ start: t, end: t + duration });
      }
    }
  }
  return slots;
}

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const two = (n: number) => String(n).padStart(2, '0');

export function formatTime(epoch: number): string {
  const p = brtParts(epoch);
  return `${two(p.hour)}:${two(p.minute)}`;
}

export function formatDateShort(epoch: number): string {
  const p = brtParts(epoch);
  return `${WEEKDAYS_SHORT[p.weekday]}, ${two(p.day)}/${two(p.month)}`;
}

export function formatDateLong(epoch: number): string {
  const p = brtParts(epoch);
  return `${WEEKDAYS_LONG[p.weekday]}, ${two(p.day)}/${two(p.month)}`;
}

export function dayKey(epoch: number): string {
  const p = brtParts(epoch);
  return `${p.year}-${two(p.month)}-${two(p.day)}`;
}

/**
 * Escolhe até `max` horários bem distribuídos (no máximo 2 por dia, manhã e tarde quando possível)
 * e monta as linhas da mensagem: "• Qui, 19/11 — 10:00 ou 15:30".
 */
export function pickSlotsForMessage(slots: Interval[], max: number): Interval[] {
  const byDay = new Map<string, Interval[]>();
  for (const s of slots) {
    const k = dayKey(s.start);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }
  const chosen: Interval[] = [];
  for (const daySlots of byDay.values()) {
    if (chosen.length >= max) break;
    const morning = daySlots.find(s => brtParts(s.start).hour < 12);
    const afternoon = daySlots.find(s => brtParts(s.start).hour >= 13);
    const picks = [morning, afternoon].filter(Boolean) as Interval[];
    if (picks.length === 0) picks.push(daySlots[0]);
    for (const p of picks) if (chosen.length < max) chosen.push(p);
  }
  return chosen;
}

export function formatSlotsForMessage(slots: Interval[]): string {
  const byDay = new Map<string, Interval[]>();
  for (const s of slots) {
    const k = dayKey(s.start);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(s);
  }
  return Array.from(byDay.values())
    .map(day => `• ${formatDateShort(day[0].start)} — ${day.map(s => formatTime(s.start)).join(' ou ')}`)
    .join('\n');
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}

export function firstName(name?: string | null): string {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  if (!first || /^\+?\d/.test(first)) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function normalizeBrPhone(raw: string): string | null {
  const text = String(raw || '').trim();
  if (text.includes('@')) return null;
  let digits = text.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}
