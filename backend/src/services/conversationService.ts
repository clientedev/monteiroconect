import { prisma } from '../database/client.js';
import { AppError } from '../utils/errors.js';
import { assertAccountAccess, SessionUser } from './accessService.js';
import { sendPushForAssignment } from './pushNotificationService.js';

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

interface ListConversationsOpts {
  whatsappId: string;
  search?: string;
  page?: number;
  limit?: number;
  includeGroups?: boolean;
}

export async function listConversations(opts: ListConversationsOpts) {
  const { whatsappId, search, page = 1, limit = 50, includeGroups = true } = opts;
  const skip = (page - 1) * limit;

  const where: any = { whatsappId };
  if (!includeGroups) {
    where.NOT = [{ contact: { phone: { endsWith: '@g.us' } } }];
  }
  if (search) {
    where.OR = [
      { contact: { name: { contains: search, mode: 'insensitive' } } },
      { contact: { phone: { contains: search, mode: 'insensitive' } } },
      { lastMessage: { contains: search, mode: 'insensitive' } },
    ];
  }

  const account = await prisma.whatsAppAccount.findUnique({
    where: { id: whatsappId },
    select: { phone: true },
  });
  const [total, conversations] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      include: {
        contact: true,
        tags: { include: { tag: true } },
        assignments: { include: { user: { select: { id: true, username: true, role: true } } } },
      },
      orderBy: [
        { lastMessageAt: 'desc' },
        { updatedAt: 'desc' },
      ],
      skip,
      take: limit,
    }),
  ]);

  return {
    total,
    page,
    limit,
    conversations: conversations.map(c => ({
      id: c.id,
      contactId: c.contact.id,
      contactName: publicContactName(c.contact.name, c.contact.phone),
      contactPhone: c.contact.phone,
      contactAvatarUrl: c.contact.avatarUrl,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
      isOpen: c.isOpen,
      aiEnabled: c.aiEnabled,
      isMuted: c.isMuted,
      tags: c.tags.map(t => t.tag),
      assignedUser: c.assignments[0]?.user || null,
    })),
  };
}

export async function getConversation(id: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: true,
      tags: { include: { tag: true } },
      assignments: { include: { user: { select: { id: true, username: true, role: true } } } },
    },
  });
  if (!conversation) throw new AppError('Conversa não encontrada', 404);
  return conversation;
}

export async function setConversationMuted(
  conversationId: string,
  muted: boolean,
  requester: SessionUser,
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, whatsappId: true },
  });
  if (!conversation) throw new AppError('Conversa não encontrada', 404);
  await assertAccountAccess(requester, conversation.whatsappId);

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { isMuted: muted },
    select: { id: true, isMuted: true },
  });

  return updated;
}

export async function cleanupDuplicateConversations(whatsappId: string, requester: SessionUser) {
  await assertAccountAccess(requester, whatsappId);
  const { sessionManager } = await import('../whatsapp/sessionManager.js');
  const count = await sessionManager.unifyAllDuplicateContacts(whatsappId);
  return { success: true, count };
}

export async function assignConversation(
  conversationId: string,
  userId: string | null,
  requester: SessionUser,
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, whatsappId: true, contact: { select: { name: true, phone: true } } },
  });
  if (!conversation) throw new AppError('Conversa não encontrada', 404);
  await assertAccountAccess(requester, conversation.whatsappId);

  let targetUser: { id: string; username: string; role: string; isActive: boolean } | null = null;
  if (userId) {
    targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, isActive: true },
    });
    if (!targetUser || !targetUser.isActive) {
      throw new AppError('O atendente selecionado não está ativo', 400);
    }

    if (targetUser.role !== 'admin') {
      const hasAccountAccess = await prisma.whatsAppAssignment.findUnique({
        where: { userId_whatsappId: { userId, whatsappId: conversation.whatsappId } },
        select: { id: true },
      });
      if (!hasAccountAccess) {
        throw new AppError('Este atendente não tem acesso ao WhatsApp da conversa', 400);
      }
    }
  }

  await prisma.conversationAssignment.deleteMany({ where: { conversationId } });
  if (targetUser) {
    await prisma.conversationAssignment.create({
      data: { conversationId, userId: targetUser.id },
    });

    const contactName = conversation.contact?.name || conversation.contact?.phone || 'Contato';
    sendPushForAssignment(targetUser.id, contactName, conversationId, conversation.whatsappId).catch(() => {});
  }

  return { assignedUser: targetUser ? { id: targetUser.id, username: targetUser.username, role: targetUser.role } : null };
}

export async function setConversationAiEnabled(
  conversationId: string,
  enabled: boolean,
  requester: SessionUser,
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, whatsappId: true },
  });
  if (!conversation) throw new AppError('Conversa não encontrada', 404);
  await assertAccountAccess(requester, conversation.whatsappId);

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: { aiEnabled: enabled },
    select: { id: true, aiEnabled: true },
  });

  return updated;
}

export async function listAssignedConversations(user: SessionUser) {
  const conversations = await prisma.conversation.findMany({
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
  });

  return conversations.map(conversation => ({
    id: conversation.id,
    contact: conversation.contact,
    whatsapp: conversation.whatsapp,
    lastMessage: conversation.lastMessage,
    lastMessageAt: conversation.lastMessageAt,
    assignedUser: conversation.assignments[0]?.user || null,
  }));
}

export async function getConversationMessages(
  conversationId: string,
  page = 1,
  limit = 50,
) {
  const skip = (page - 1) * limit;

  const currentConv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      whatsappId: true,
      lastMessage: true,
      lastMessageAt: true,
      contact: { select: { id: true, phone: true } },
    },
  });

  if (!currentConv) throw new AppError('Conversa não encontrada', 404);

  let targetConvIds = [conversationId];
  const rawPhone = currentConv.contact?.phone;

  if (rawPhone) {
    const raw = rawPhone.trim();
    const variants = new Set<string>([raw]);

    if (!raw.endsWith('@g.us')) {
      const clean = raw.replace('@s.whatsapp.net', '').replace(/:\d+$/, '').replace(/\D/g, '');
      if (clean) {
        variants.add(clean);
        variants.add(`${clean}@s.whatsapp.net`);

        if (clean.startsWith('55') && clean.length === 12) {
          const ddd = clean.slice(2, 4);
          const num = clean.slice(4);
          const with9 = `55${ddd}9${num}`;
          variants.add(with9);
          variants.add(`${with9}@s.whatsapp.net`);
        } else if (clean.startsWith('55') && clean.length === 13 && clean[4] === '9') {
          const ddd = clean.slice(2, 4);
          const num = clean.slice(5);
          const without9 = `55${ddd}${num}`;
          variants.add(without9);
          variants.add(`${without9}@s.whatsapp.net`);
        }
      }
    }

    const matchingConversations = await prisma.conversation.findMany({
      where: {
        whatsappId: currentConv.whatsappId,
        contact: {
          phone: { in: Array.from(variants) },
        },
      },
      select: { id: true },
    });

    if (matchingConversations.length > 0) {
      targetConvIds = Array.from(new Set([...targetConvIds, ...matchingConversations.map(c => c.id)]));
    }
  }

  const where = { conversationId: { in: targetConvIds } };
  let total = await prisma.message.count({ where });

  let messages = await prisma.message.findMany({
    where,
    orderBy: [
      { timestamp: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    skip,
    take: limit,
  });

  // Auto-recuperação: se a conversa ficou sem mensagens após rotina de alívio,
  // mas ainda possui a prévia de lastMessage, reconstrói a mensagem para exibição imediata
  if (total === 0 && currentConv.lastMessage && page === 1) {
    try {
      const restored = await prisma.message.create({
        data: {
          conversationId: currentConv.id,
          whatsappId: currentConv.whatsappId,
          type: 'text',
          content: currentConv.lastMessage,
          isFromMe: false,
          isRead: true,
          timestamp: currentConv.lastMessageAt || new Date(),
          toPhone: currentConv.contact?.phone || '',
        },
      });
      messages = [restored];
      total = 1;
    } catch {
      // Ignora erro de corrida se já criada simultaneamente
    }
  }

  return { total, page, limit, messages: messages.reverse() };
}

export async function markConversationRead(conversationId: string) {
  await prisma.message.updateMany({
    where: { conversationId, isRead: false },
    data: { isRead: true },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0 },
  });
}
