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
function createClient() {
  return new PrismaClient({
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
