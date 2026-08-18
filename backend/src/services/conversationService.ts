import { prisma } from '../database/client.js';
import { AppError } from '../utils/errors.js';

interface ListConversationsOpts {
  whatsappId: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listConversations(opts: ListConversationsOpts) {
  const { whatsappId, search, page = 1, limit = 50 } = opts;
  const skip = (page - 1) * limit;

  const where: any = { whatsappId };
  if (search) {
    where.OR = [
      { contact: { name: { contains: search } } },
      { contact: { phone: { contains: search } } },
      { lastMessage: { contains: search } },
    ];
  }

  const [total, conversations] = await Promise.all([
    prisma.conversation.count({ where }),
    prisma.conversation.findMany({
      where,
      include: {
        contact: true,
        tags: { include: { tag: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
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
      contactName: c.contact.name,
      contactPhone: c.contact.phone,
      contactAvatarUrl: c.contact.avatarUrl,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
      isOpen: c.isOpen,
      tags: c.tags.map(t => t.tag),
    })),
  };
}

export async function getConversation(id: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { contact: true, tags: { include: { tag: true } } },
  });
  if (!conversation) throw new AppError('Conversa não encontrada', 404);
  return conversation;
}

export async function getConversationMessages(
  conversationId: string,
  page = 1,
  limit = 50,
) {
  const skip = (page - 1) * limit;
  const [total, messages] = await Promise.all([
    prisma.message.count({ where: { conversationId } }),
    prisma.message.findMany({
      where: { conversationId },
      // A primeira página deve trazer as mensagens mais recentes. Consultamos
      // em ordem decrescente por eficiência e devolvemos em ordem cronológica
      // para a interface de chat.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: limit,
    }),
  ]);

  await prisma.message.updateMany({
    where: { conversationId, isRead: false },
    data: { isRead: true },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0 },
  });

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
