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

  const where: any = { whatsappId };
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
  leadStatus?: string;
  leadValue?: number | null;
  leadSource?: string;
}) {
  return prisma.contact.update({ where: { id }, data });
}
