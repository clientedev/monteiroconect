import { prisma } from '../database/client.js';

export async function getDashboardStats() {
  const [
    connectedCount,
    disconnectedCount,
    totalConversations,
    unreadMessages,
    messagesToday,
    recentMessages,
    recentConversations,
    messagesPerAccount,
  ] = await Promise.all([
    prisma.whatsAppAccount.count({ where: { status: 'CONNECTED' } }),
    prisma.whatsAppAccount.count({ where: { status: { not: 'CONNECTED' } } }),
    prisma.conversation.count({ where: { isOpen: true } }),
    prisma.conversation.aggregate({ _sum: { unreadCount: true }, where: { isOpen: true } }),
    prisma.message.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { conversation: { include: { contact: true } } },
    }),
    prisma.conversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: 10,
      include: { contact: true, whatsapp: true },
      where: { isOpen: true },
    }),
    prisma.whatsAppAccount.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        _count: { select: { conversations: true } },
      },
    }),
  ]);

  return {
    connectedCount,
    disconnectedCount,
    totalConversations,
    unreadMessages: unreadMessages._sum.unreadCount || 0,
    messagesToday,
    recentMessages,
    recentConversations,
    messagesPerAccount,
  };
}
