import { PrismaClient } from '@prisma/client';

/**
 * `Message.mediaData` guarda os metadados da mídia e, para arquivos até 15MB, uma cópia em base64
 * (usada para recuperar a mídia após reinícios do container). Esse campo pode ter vários MB por linha.
 *
 * Ele fica OMITIDO por padrão em todas as consultas: listar mensagens de uma conversa, dashboard,
 * busca e histórico da IA não precisam dele, e carregá-lo inflava a RAM do Node, do Postgres
 * (leitura do TOAST) e o JSON enviado ao navegador. Quem precisa do campo pede explicitamente
 * com `omit: { mediaData: false }` (ver recoverMediaFile em sessionManager).
 */
/**
 * Limita o pool de conexões do Prisma. O padrão é (núcleos × 2 + 1) e, no Railway, o container
 * enxerga todos os núcleos da máquina hospedeira — o pool podia abrir dezenas de conexões, e cada
 * uma mantém um processo do Postgres ocupando RAM (cobrada por GB). Dez conexões sobram para a
 * carga deste sistema; consultas excedentes apenas aguardam na fila (pool_timeout).
 * Ajustável por PRISMA_CONNECTION_LIMIT; respeita valores já presentes na DATABASE_URL.
 */
function databaseUrlWithPoolLimits(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//i.test(url)) return undefined;
  const limit = Math.max(2, parseInt(process.env.PRISMA_CONNECTION_LIMIT || '10', 10) || 10);
  const extra: string[] = [];
  if (!/[?&]connection_limit=/.test(url)) extra.push(`connection_limit=${limit}`);
  if (!/[?&]pool_timeout=/.test(url)) extra.push('pool_timeout=30');
  if (extra.length === 0) return undefined;
  return `${url}${url.includes('?') ? '&' : '?'}${extra.join('&')}`;
}

function createClient() {
  const pooledUrl = databaseUrlWithPoolLimits();
  return new PrismaClient({
    ...(pooledUrl ? { datasources: { db: { url: pooledUrl } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    omit: { message: { mediaData: true } },
  });
}

type AppPrismaClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

export const prisma: AppPrismaClient = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
