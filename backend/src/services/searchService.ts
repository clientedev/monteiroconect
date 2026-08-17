import { prisma } from '../database/client.js';

export async function globalSearch(query: string) {
  if (!query || query.length < 2) return { contacts: [], conversations: [], messages: [] };

  const [contacts, conversations, messages] = await Promise.all([
    prisma.contact.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { phone: { contains: query } },
        ],
      },
      take: 20,
      include: { whatsapp: { select: { id: true, name: true, status: true } } },
    }),
    prisma.conversation.findMany({
      where: {
        OR: [
          { contact: { name: { contains: query } } },
          { contact: { phone: { contains: query } } },
          { lastMessage: { contains: query } },
        ],
      },
      take: 20,
      include: {
        contact: true,
        whatsapp: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    }),
    prisma.message.findMany({
      where: { content: { contains: query } },
      take: 20,
      include: {
        conversation: {
          include: {
            contact: true,
            whatsapp: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return { contacts, conversations, messages };
}
