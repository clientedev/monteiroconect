import { prisma } from '../database/client.js';
import { AppError } from '../utils/errors.js';

function publicContactName(name: string | null, phone: string): string | null {
  if (!name || name === phone || name.endsWith('@lid') || name.endsWith('@s.whatsapp.net')) return null;
  return name;
}

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
      },
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { updatedAt: 'desc' },
      ],
      skip,
      take: limit,
    }),
  ]);

  // Nunca exibe a conversa técnica da própria conta ou os eventos de
  // protocolo que possam ter sido gravados por versões antigas.
  const visible = conversations.filter(c =>
    c.contact.phone !== account?.phone &&
    !c.lastMessage?.includes('protocolMessage')
  );

  return {
    total: total - (conversations.length - visible.length),
    page,
    limit,
    conversations: visible.map(c => ({
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
  const total = await prisma.message.count({ where: { conversationId } });

  // FIX 3: Ordena pela coluna `timestamp` (timestamp real do WhatsApp) e usa
  // `createdAt` como desempate. Busca DECRESCENTE (mais recentes primeiro)
  // para paginar por histórico, mas retorna em ordem CRESCENTE (cronológica)
  // para o chat — sem o .reverse() que era frágil com timestamps idênticos.
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [
      { timestamp: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    skip,
    take: limit,
  });

  await prisma.message.updateMany({
    where: { conversationId, isRead: false },
    data: { isRead: true },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { unreadCount: 0 },
  });

  // Reverte para ordem cronológica (mais antigo primeiro) para o frontend
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
