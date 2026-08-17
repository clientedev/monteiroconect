import { prisma } from '../database/client.js';
import { AppError } from '../utils/errors.js';

export async function listChatbots(whatsappAccountId?: string) {
  const where: any = {};
  if (whatsappAccountId) where.whatsappAccountId = whatsappAccountId;

  return prisma.chatbot.findMany({
    where,
    include: {
      autoReplies: { orderBy: { order: 'asc' } },
      whatsappAccount: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getChatbot(id: string) {
  const chatbot = await prisma.chatbot.findUnique({
    where: { id },
    include: {
      autoReplies: { orderBy: { order: 'asc' } },
      whatsappAccount: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!chatbot) throw new AppError('Chatbot não encontrado', 404);
  return chatbot;
}

export async function createChatbot(data: {
  name: string;
  whatsappAccountId: string;
  useAi?: boolean;
  greetingMessage?: string;
  fallbackMessage?: string;
  triggerMode?: string;
  autoReplies?: Array<{
    triggerType: string;
    trigger: string;
    reply: string;
    mediaType?: string;
    mediaUrl?: string;
    order?: number;
  }>;
}) {
  const whatsapp = await prisma.whatsAppAccount.findUnique({ where: { id: data.whatsappAccountId } });
  if (!whatsapp) throw new AppError('Conta WhatsApp não encontrada', 404);

  return prisma.chatbot.create({
    data: {
      name: data.name,
      whatsappAccountId: data.whatsappAccountId,
      useAi: data.useAi || false,
      greetingMessage: data.greetingMessage || null,
      fallbackMessage: data.fallbackMessage || null,
      triggerMode: data.triggerMode || 'any',
      autoReplies: {
        create: (data.autoReplies || []).map((r, i) => ({
          triggerType: r.triggerType || 'contains',
          trigger: r.trigger,
          reply: r.reply,
          mediaType: r.mediaType || 'text',
          mediaUrl: r.mediaUrl || null,
          order: r.order ?? i,
        })),
      },
    },
    include: { autoReplies: { orderBy: { order: 'asc' } } },
  });
}

export async function updateChatbot(id: string, data: {
  name?: string;
  isActive?: boolean;
  useAi?: boolean;
  greetingMessage?: string | null;
  fallbackMessage?: string | null;
  triggerMode?: string;
}) {
  await getChatbot(id);
  return prisma.chatbot.update({
    where: { id },
    data,
    include: { autoReplies: { orderBy: { order: 'asc' } } },
  });
}

export async function deleteChatbot(id: string) {
  await getChatbot(id);
  await prisma.chatbot.delete({ where: { id } });
  return { deleted: true };
}

export async function toggleChatbot(id: string) {
  const chatbot = await getChatbot(id);
  return prisma.chatbot.update({
    where: { id },
    data: { isActive: !chatbot.isActive },
    include: { autoReplies: { orderBy: { order: 'asc' } } },
  });
}

export async function addAutoReply(chatbotId: string, data: {
  triggerType: string;
  trigger: string;
  reply: string;
  mediaType?: string;
  mediaUrl?: string;
}) {
  await getChatbot(chatbotId);
  const count = await prisma.autoReply.count({ where: { chatbotId } });
  return prisma.autoReply.create({
    data: {
      chatbotId,
      triggerType: data.triggerType,
      trigger: data.trigger,
      reply: data.reply,
      mediaType: data.mediaType || 'text',
      mediaUrl: data.mediaUrl || null,
      order: count,
    },
  });
}

export async function updateAutoReply(id: string, data: {
  triggerType?: string;
  trigger?: string;
  reply?: string;
  mediaType?: string;
  mediaUrl?: string;
  isActive?: boolean;
  order?: number;
}) {
  const reply = await prisma.autoReply.findUnique({ where: { id } });
  if (!reply) throw new AppError('Auto-resposta não encontrada', 404);
  return prisma.autoReply.update({ where: { id }, data });
}

export async function deleteAutoReply(id: string) {
  const reply = await prisma.autoReply.findUnique({ where: { id } });
  if (!reply) throw new AppError('Auto-resposta não encontrada', 404);
  await prisma.autoReply.delete({ where: { id } });
  return { deleted: true };
}

export async function findMatchingReply(whatsappAccountId: string, messageContent: string) {
  const chatbots = await prisma.chatbot.findMany({
    where: { whatsappAccountId, isActive: true },
    include: {
      autoReplies: {
        where: { isActive: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  for (const chatbot of chatbots) {
    for (const rule of chatbot.autoReplies) {
      if (matchesTrigger(rule.triggerType, rule.trigger, messageContent)) {
        return {
          reply: rule.reply,
          mediaType: rule.mediaType,
          mediaUrl: rule.mediaUrl,
          chatbotName: chatbot.name,
        };
      }
    }
  }

  // Fallback apenas no modo "any" — responde qualquer mensagem
  for (const chatbot of chatbots) {
    if (chatbot.fallbackMessage && chatbot.triggerMode === 'any') {
      return {
        reply: chatbot.fallbackMessage,
        mediaType: 'text',
        mediaUrl: null,
        chatbotName: chatbot.name,
      };
    }
  }

  return null;
}

/**
 * Retorna o primeiro chatbot ativo da conta (para saudação, IA e modo de gatilho).
 */
export async function getFirstActiveChatbot(whatsappAccountId: string) {
  return prisma.chatbot.findFirst({
    where: { whatsappAccountId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getGreetingForAccount(whatsappAccountId: string) {
  const chatbot = await prisma.chatbot.findFirst({
    where: { whatsappAccountId, isActive: true, greetingMessage: { not: null } },
  });
  return chatbot?.greetingMessage || null;
}

function matchesTrigger(triggerType: string, trigger: string, content: string): boolean {
  const normalizedContent = content.toLowerCase().trim();
  const normalizedTrigger = trigger.toLowerCase().trim();

  switch (triggerType) {
    case 'exact':
      return normalizedContent === normalizedTrigger;
    case 'starts_with':
      return normalizedContent.startsWith(normalizedTrigger);
    case 'regex':
      try {
        return new RegExp(normalizedTrigger, 'i').test(content);
      } catch {
        return false;
      }
    case 'contains':
    default:
      return normalizedContent.includes(normalizedTrigger);
  }
}
