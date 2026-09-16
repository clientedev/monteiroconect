import { prisma } from '../database/client.js';
import { SessionUser } from './accessService.js';
import { sessionManager } from '../whatsapp/sessionManager.js';

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

export async function getDashboardStats(user?: SessionUser) {
  const today = startOfSaoPauloDay();
  const [
    totalConversations,
    unreadMessages,
    totalMessages,
    messagesToday,
    recentMessages,
    recentConversations,
    unreadConversations,
    rawAccounts,
    assignedConversations,
  ] = await Promise.all([
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
      orderBy: [
        { timestamp: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
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
    user
      ? prisma.conversation.findMany({
          where: {
            isOpen: true,
            assignments: { some: { userId: user.id } },
          },
          orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
          take: 20,
          include: {
            contact: true,
            whatsapp: { select: { id: true, name: true, phone: true } },
            assignments: { include: { user: { select: { id: true, username: true, role: true } } } },
          },
        })
      : Promise.resolve([]),
  ]);

  // Consulta o status em tempo real do WhatsAppSessionManager
  const liveSessions = sessionManager.getAllSessions();
  const sessionMap = new Map(liveSessions.map(s => [s.id, s]));

  let connectedCount = 0;
  let disconnectedCount = 0;

  const messagesPerAccount = rawAccounts.map(acc => {
    const live = sessionMap.get(acc.id);
    const liveStatus = live?.status || acc.status;
    if (liveStatus === 'CONNECTED') {
      connectedCount++;
    } else {
      disconnectedCount++;
    }
    return {
      id: acc.id,
      name: acc.name,
      status: liveStatus,
      _count: { conversations: acc._count.conversations },
    };
  });

  const isVisibleConversation = (conversation: any) =>
    conversation.contact?.phone !== conversation.whatsapp?.phone &&
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
    assignedConversations,
    assignedCount: assignedConversations.length,
  };
}

