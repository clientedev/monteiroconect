import { prisma } from '../database/client.js';

function publicContactName(name: string | null, phone: string): string | null {
  if (!name || name === phone || name.endsWith('@lid') || name.endsWith('@s.whatsapp.net')) return null;
  return name;
}

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

  return {
    total,
    page,
    limit,
    contacts: contacts.map(contact => ({ ...contact, name: publicContactName(contact.name, contact.phone) })),
  };
}

export async function updateContact(id: string, data: {
  name?: string;
  notes?: string;
}) {
  return prisma.contact.update({ where: { id }, data });
}
