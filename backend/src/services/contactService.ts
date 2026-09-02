import { prisma } from '../database/client.js';

function publicContactName(name: string | null, phone: string): string | null {
  const value = name?.trim() || '';
  if (
    !value ||
    value === phone ||
    /@(?:lid|s\.whatsapp\.net|g\.us)$/.test(value) ||
    /^\+?[\d\s().-]{7,}$/.test(value)
  ) return null;
  return value;
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
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { lastMessage: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [total, contacts] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      include: { conversations: { select: { id: true } } },
      orderBy: { lastContact: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    limit,
    contacts: contacts.map(contact => ({
      id: contact.id,
      name: publicContactName(contact.name, contact.phone),
      phone: contact.phone,
      conversationId: contact.conversations[0]?.id || null,
      conversationCount: contact.conversations.length,
    })),
  };
}

export async function updateContact(id: string, data: {
  name?: string;
  notes?: string;
}) {
  return prisma.contact.update({ where: { id }, data });
}
