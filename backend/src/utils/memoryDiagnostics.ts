import os from 'node:os';
import { promises as fs } from 'node:fs';
import { prisma } from '../database/client.js';
import { logger } from './logger.js';

/**
 * Registra, de tempos em tempos, uma linha com o retrato do consumo de memória.
 *
 * O Railway cobra pela memória do container (cgroup), que soma a memória do processo (anon) com o
 * cache de arquivos do kernel (file). Esta linha separa as duas coisas e mostra também o heap do
 * Node e as conexões abertas no Postgres — é o que permite ajustar os limites com segurança.
 * Custo: uma leitura de arquivo e uma consulta leve a cada 30 minutos.
 */
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

async function readCgroup(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    out.current = Number((await fs.readFile('/sys/fs/cgroup/memory.current', 'utf8')).trim());
    const stat = await fs.readFile('/sys/fs/cgroup/memory.stat', 'utf8');
    for (const line of stat.split('\n')) {
      const [key, value] = line.split(' ');
      if (key === 'anon' || key === 'file' || key === 'shmem' || key === 'kernel') out[key] = Number(value);
    }
  } catch {
    // cgroup v1 ou ambiente local: segue apenas com os números do processo
  }
  return out;
}

async function snapshot(): Promise<void> {
  const mem = process.memoryUsage();
  const cg = await readCgroup();
  let pg = '';
  try {
    const rows = await prisma.$queryRaw<Array<{ total: bigint; mine: bigint }>>`
      SELECT count(*)::bigint AS total,
             count(*) FILTER (WHERE datname = current_database())::bigint AS mine
      FROM pg_stat_activity WHERE backend_type = 'client backend'`;
    pg = ` | pgConnections=${Number(rows[0]?.mine ?? 0)}/${Number(rows[0]?.total ?? 0)}`;
  } catch {
    // diagnóstico é opcional; nunca interfere no funcionamento
  }
  const cgroup = cg.current
    ? ` | container=${mb(cg.current)}MB (anon=${mb(cg.anon || 0)} file=${mb(cg.file || 0)} shmem=${mb(cg.shmem || 0)} kernel=${mb(cg.kernel || 0)})`
    : '';
  logger.info(
    `[memoria] rss=${mb(mem.rss)}MB heapUsed=${mb(mem.heapUsed)} heapTotal=${mb(mem.heapTotal)} ` +
    `external=${mb(mem.external)} arrayBuffers=${mb(mem.arrayBuffers)}${cgroup}${pg} ` +
    `| cpus=${os.cpus().length} uptimeH=${(process.uptime() / 3600).toFixed(1)}`,
  );
}

export function startMemoryDiagnostics(): void {
  if (process.env.MEMORY_DIAGNOSTICS === 'false') return;
  const run = () => { snapshot().catch(() => {}); };
  setTimeout(run, 4 * 60_000).unref();
  setInterval(run, 30 * 60_000).unref();
}
