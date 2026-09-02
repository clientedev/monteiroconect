import { prisma } from '../database/client.js';

function startOfSaoPauloDay(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  // São Paulo is UTC-3; constructing an absolute instant prevents the
  // Railway process timezone (usually UTC) from shifting the metric's day.
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00-03:00`);
}

export async function getDashboardStats() {
  const today = startOfSaoPauloDay();
  const [
    connectedCount,
    disconnectedCount,
    totalConversations,
    unreadMessages,
    totalMessages,
    messagesToday,
    recentMessages,
    recentConversations,
    unreadConversations,
    messagesPerAccount,
  ] = await Promise.all([
    prisma.whatsAppAccount.count({ where: { status: 'CONNECTED' } }),
    prisma.whatsAppAccount.count({ where: { status: { not: 'CONNECTED' } } }),
    prisma.conversation.count({ where: { isOpen: true } }),
    prisma.conversation.aggregate({ _sum: { unreadCount: true }, where: { unreadCount: { gt: 0 } } }),
    prisma.message.count(),
    prisma.message.count({
      where: {
        OR: [
          { timestamp: { gte: today } },
          { timestamp: null, createdAt: { gte: today } },
        ],
      },
    }),
    prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { conversation: { include: { contact: true } } },
    }),
    prisma.conversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: 10,
      include: { contact: true, whatsapp: { select: { id: true, name: true, phone: true } } },
      where: { isOpen: true },
    }),
    prisma.conversation.findMany({
      where: { unreadCount: { gt: 0 } },
      orderBy: { lastMessageAt: 'desc' },
      include: { contact: true, whatsapp: { select: { id: true, name: true, phone: true } } },
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

  const isVisibleConversation = (conversation: any) =>
    conversation.contact.phone !== conversation.whatsapp?.phone &&
    !conversation.lastMessage?.includes('protocolMessage');
  const visibleUnreadConversations = unreadConversations.filter(isVisibleConversation);

  return {
    connectedCount,
    disconnectedCount,
    totalConversations,
    unreadMessages: visibleUnreadConversations.reduce((sum, c) => sum + c.unreadCount, 0),
    totalMessages,
    messagesToday,
    recentMessages,
    recentConversations: recentConversations.filter(isVisibleConversation),
    unreadConversations: visibleUnreadConversations.slice(0, 15),
    messagesPerAccount,
  };
}
