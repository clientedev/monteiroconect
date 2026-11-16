/**
 * O libsignal (usado pelo Baileys) escreve direto no console a cada falha de descriptografia,
 * incluindo o stack trace completo. Em rajadas (ex.: reconexão com muitas mensagens pendentes)
 * isso passa de 500 linhas/s, o Railway descarta logs e o processo gasta CPU/RAM formatando texto.
 *
 * Aqui essas mensagens conhecidas são agregadas: no máximo uma linha-resumo a cada 60s com a
 * contagem por tipo. Todas as outras chamadas de console passam sem alteração.
 */
const NOISE_PATTERNS: Array<[RegExp, string]> = [
  [/^Session error:/, 'Session error (Bad MAC / MessageCounter)'],
  [/^Failed to decrypt message with any known session/, 'Failed to decrypt with known session'],
  [/^Closing open session in favor of incoming prekey bundle/, 'Closing open session (prekey bundle)'],
  [/^Decrypted message with closed session/, 'Decrypted with closed session'],
  [/^Session already (open|closed)/, 'Session already open/closed'],
  // console.info do libsignal: despeja o objeto da sessão inteiro, INCLUINDO chaves privadas, nos logs.
  [/^(Closing|Opening) session:/, 'Session open/close'],
  [/^Removing old closed session:/, 'Old closed session removed'],
  [/^Migrating session to:/, 'Session migrated'],
];

const counts = new Map<string, number>();
let flushTimer: NodeJS.Timeout | null = null;

function flush(write: (...args: unknown[]) => void) {
  flushTimer = null;
  if (counts.size === 0) return;
  const summary = Array.from(counts.entries()).map(([k, n]) => `${k}: ${n}`).join(' | ');
  counts.clear();
  write(`[libsignal] últimos 60s → ${summary}`);
}

function wrap(method: 'error' | 'warn' | 'info') {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    const first = typeof args[0] === 'string' ? args[0] : '';
    const match = first && NOISE_PATTERNS.find(([re]) => re.test(first));
    if (!match) return original(...args);
    counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    if (!flushTimer) {
      flushTimer = setTimeout(() => flush(original), 60_000);
      flushTimer.unref();
    }
  };
}

if (process.env.LIBSIGNAL_VERBOSE_LOGS !== 'true') {
  wrap('error');
  wrap('warn');
  wrap('info');
}
