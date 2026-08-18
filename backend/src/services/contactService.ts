import { prisma } from '../database/client.js';

interface ListContactsOpts {
  whatsappId: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listContacts(opts: ListContactsOpts) {
  const { whatsappId, search, page = 1, limit = 50 } = opts;
  const skip = (page - 1) * limit;

  // Grupos pertencem à caixa de conversas, não à base de leads/contatos.
  const where: any = { whatsappId, NOT: { phone: { endsWith: '@g.us' } } };
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { phone: { contains: search } },
      { lastMessage: { contains: search } },
    ];
  }

  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      orderBy: { lastContact: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return { total, page, limit, contacts };
}

export async function updateContact(id: string, data: {
  name?: string;
  notes?: string;
}) {
  return prisma.contact.update({ where: { id }, data });
}
