import webpush from 'web-push';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Inicializa VAPID com as chaves configuradas
if (env.vapidPublicKey && env.vapidPrivateKey) {
  try {
    webpush.setVapidDetails(
      env.vapidSubject,
      env.vapidPublicKey,
      env.vapidPrivateKey
    );
    logger.info('Web Push (VAPID) configurado com sucesso');
  } catch (err: any) {
    logger.error('Erro ao configurar VAPID para Web Push:', err?.message || err);
  }
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    conversationId?: string;
    accountId?: string;
    [key: string]: any;
  };
}

export function getVapidPublicKey(): string {
  return env.vapidPublicKey;
}

export async function savePushSubscription(
  userId: string | null,
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  },
  userAgent?: string
) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('Assinatura Push inválida');
  }

  return prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId: userId || null,
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId: userId || null,
      userAgent: userAgent ? userAgent.slice(0, 255) : null,
      updatedAt: new Date(),
    },
  });
}

export async function removePushSubscription(endpoint: string) {
  if (!endpoint) return;
  try {
    await prisma.pushSubscription.delete({
      where: { endpoint },
    });
  } catch {
    // Ignora se não existir
  }
}

async function sendNotificationToEndpoint(
  sub: { id: string; endpoint: string; p256dh: string; auth: string },
  formattedPayload: string
) {
  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };

  try {
    await webpush.sendNotification(pushSubscription, formattedPayload, {
      TTL: 60 * 60 * 24, // 24 horas no cache do APNs / FCM
      urgency: 'high',
    });
  } catch (err: any) {
    const statusCode = err?.statusCode;
    // 404 Not Found ou 410 Gone significa que a inscrição foi revogada pelo usuário ou expirou
    if (statusCode === 404 || statusCode === 410) {
      logger.info(`Assinatura Push expirada/inválida (${statusCode}), removendo: ${sub.id}`);
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    } else {
      logger.warn(`Falha ao entregar push para sub ${sub.id}: ${err?.message || err}`);
    }
  }
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return;

    const stringified = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/logo.png',
      badge: payload.badge || '/logo.png',
      tag: payload.tag || 'mc-wa-msg',
      renotify: true,
      data: payload.data || {},
    });

    await Promise.allSettled(
      subscriptions.map(sub => sendNotificationToEndpoint(sub, stringified))
    );
  } catch (err) {
    logger.error('Erro em sendPushToUser:', err);
  }
}

export async function sendPushForNewMessage(data: {
  message: any;
  contact: any;
  conversation?: any;
  accountId: string;
}) {
  try {
    const { message, contact, conversation, accountId } = data;
    if (message?.isFromMe) return;

    // REGRA OBRIGATÓRIA: Notificações de GRUPOS (@g.us) são 100% silenciadas por padrão
    const contactPhone = String(contact?.phone || conversation?.contact?.phone || '').trim();
    const isGroup = contactPhone.endsWith('@g.us') || Boolean(conversation?.contact?.phone?.endsWith('@g.us'));
    if (isGroup) {
      logger.info(`Notificação Push suprimida para GRUPO: ${contactPhone}`);
      return;
    }

    const conversationId = conversation?.id || message?.conversationId;
    if (conversationId) {
      const convDb = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { isMuted: true, contact: { select: { phone: true } } },
      });
      if (convDb?.isMuted || conversation?.isMuted || convDb?.contact?.phone?.endsWith('@g.us')) {
        logger.info(`Notificação Push suprimida para conversa silenciada: ${conversationId}`);
        return;
      }
    }

    const contactName = contact?.name || contact?.phone || 'Contato WhatsApp';
    const typeMap: Record<string, string> = {
      sticker: '🎭 Figurinha',
      image: '📷 Imagem',
      video: '🎥 Vídeo',
      audio: '🎵 Áudio',
      document: '📄 Documento',
      location: '📍 Localização',
      contact: '👤 Contato',
      poll: '📊 Enquete',
      reaction: 'Reação',
    };
    let bodyPreview = (message?.content || '').trim();
    if (!bodyPreview || bodyPreview.startsWith('[messageContextInfo]') || bodyPreview.startsWith('[unknown]') || bodyPreview === '[sticker]') {
      bodyPreview = typeMap[message?.mediaType || message?.type || ''] || 'Nova mensagem recebida';
    }

    const payload: PushPayload = {
      title: `${contactName}`,
      body: bodyPreview,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: conversationId ? `conv-${conversationId}` : 'mc-wa-msg',
      data: {
        url: conversationId ? `/conversations?convId=${conversationId}` : '/conversations',
        conversationId,
        accountId,
      },
    };

    // 1. Verifica se a conversa possui atendente atribuído
    let targetUserIds: string[] = [];

    if (conversationId) {
      const assignment = await prisma.conversationAssignment.findFirst({
        where: { conversationId },
        select: { userId: true },
      });
      if (assignment?.userId) {
        targetUserIds.push(assignment.userId);
      }
    }

    // 2. Se não houver atendente atribuído, notifica atendentes com acesso ao WhatsApp e admins
    if (targetUserIds.length === 0) {
      const [whatsappAssigned, admins] = await Promise.all([
        prisma.whatsAppAssignment.findMany({
          where: { whatsappId: accountId },
          select: { userId: true },
        }),
        prisma.user.findMany({
          where: { role: 'admin', isActive: true },
          select: { id: true },
        }),
      ]);

      const userSet = new Set<string>();
      whatsappAssigned.forEach(a => userSet.add(a.userId));
      admins.forEach(a => userSet.add(a.id));
      targetUserIds = Array.from(userSet);
    }

    let subscriptions: any[] = [];
    if (targetUserIds.length > 0) {
      subscriptions = await prisma.pushSubscription.findMany({
        where: { userId: { in: targetUserIds } },
      });
    } else {
      // Fallback: se nenhum usuário foi mapeado especificamente, envia para todas as assinaturas ativas
      subscriptions = await prisma.pushSubscription.findMany();
    }

    if (subscriptions.length === 0) return;

    const stringified = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/logo.png',
      badge: payload.badge || '/logo.png',
      tag: payload.tag,
      renotify: true,
      data: payload.data,
    });

    await Promise.allSettled(
      subscriptions.map(sub => sendNotificationToEndpoint(sub, stringified))
    );
  } catch (err) {
    logger.error('Erro em sendPushForNewMessage:', err);
  }
}

export async function sendPushForAssignment(
  userId: string,
  contactName: string,
  conversationId: string,
  accountId: string
) {
  try {
    const payload: PushPayload = {
      title: 'Conversa Atribuída',
      body: `A conversa com ${contactName} foi encaminhada para você.`,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: `assign-${conversationId}`,
      data: {
        url: `/conversations?convId=${conversationId}`,
        conversationId,
        accountId,
      },
    };

    await sendPushToUser(userId, payload);
  } catch (err) {
    logger.error('Erro em sendPushForAssignment:', err);
  }
}
