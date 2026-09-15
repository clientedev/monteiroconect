import { Router } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  sendPushToUser,
} from '../services/pushNotificationService.js';
import { z } from 'zod';

const router = Router();

// Retorna chave pública VAPID (pode ser chamada antes ou após login)
router.get('/vapid-public-key', (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

// Rotas autenticadas
router.use(authMiddleware);

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
});

router.post('/subscribe', async (req: AuthRequest, res, next) => {
  try {
    const { subscription } = subscribeSchema.parse(req.body);
    const userAgent = req.headers['user-agent'] as string | undefined;

    const saved = await savePushSubscription(
      req.user?.id || null,
      subscription,
      userAgent
    );

    res.json({ success: true, id: saved.id });
  } catch (err) {
    next(err);
  }
});

router.post('/unsubscribe', async (req: AuthRequest, res, next) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string() }).parse(req.body);
    await removePushSubscription(endpoint);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Envia notificação de teste para o próprio usuário (útil para testar com app fechado)
router.post('/test', async (req: AuthRequest, res, next) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Não autorizado' });
      return;
    }

    await sendPushToUser(req.user.id, {
      title: 'Monteiro Conecta (Teste)',
      body: 'Notificação em segundo plano funcionando com o app fechado!',
      icon: '/logo.png',
      badge: '/logo.png',
      tag: 'test-push',
      data: {
        url: '/conversations',
      },
    });

    res.json({ success: true, message: 'Push de teste disparado' });
  } catch (err) {
    next(err);
  }
});

export default router;
