import { prisma } from '../database/client.js';
import { AppError } from '../utils/errors.js';
import { assertAccountAccess, SessionUser } from './accessService.js';

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

export async function assignConversation(
  conversationId: string,
  userId: string | null,
  requester: SessionUser,
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, whatsappId: true },
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
  }

  return { assignedUser: targetUser ? { id: targetUser.id, username: targetUser.username, role: targetUser.role } : null };
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
      whatsappId: true,
      contact: { select: { phone: true } },
    },
  });

  if (!currentConv) throw new AppError('Conversa não encontrada', 404);

  let targetConvIds = [conversationId];

  const rawPhone = currentConv.contact?.phone;
  // Conversas novas já são unificadas pelo gerenciador de sessão. Só procura
  // equivalentes legadas quando o contato ainda está identificado por LID/JID,
  // evitando uma consulta extra em toda abertura de conversa.
  if (rawPhone && (rawPhone.includes('@lid') || rawPhone.includes('@s.whatsapp.net'))) {
    const cleanPhone = rawPhone.replace('@s.whatsapp.net', '').replace(/:\d+$/, '');

    const matchingConversations = await prisma.conversation.findMany({
      where: {
        whatsappId: currentConv.whatsappId,
        contact: {
          OR: [
            { phone: rawPhone },
            { phone: cleanPhone },
            { phone: `${cleanPhone}@s.whatsapp.net` },
          ],
        },
      },
      select: { id: true },
    });

    if (matchingConversations.length > 0) {
      targetConvIds = Array.from(new Set([...targetConvIds, ...matchingConversations.map(c => c.id)]));
    }
  }

  const where = { conversationId: { in: targetConvIds } };

  // As duas consultas são independentes. Não bloqueia a entrega do histórico
  // aguardando a contagem total ou a atualização de badges.
  const [total, messages] = await Promise.all([
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: [
        { timestamp: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      skip,
      take: limit,
    }),
  ]);

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
