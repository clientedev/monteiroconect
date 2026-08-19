import { Router } from 'express';
import { listContacts, updateContact } from '../services/contactService.js';
import { authMiddleware } from '../middleware/auth.js';
import { sessionManager } from '../whatsapp/sessionManager.js';
import { prisma } from '../database/client.js';
import { z } from 'zod';

const router = Router();

// Foto de perfil do contato, sempre fresca direto do WhatsApp.
// ROTA PÚBLICA: tags <img> não enviam header de autorização — exigir JWT
// aqui fazia toda foto falhar com 401. O ID do contato (cuid) é inviolável.
// Aceita telefone, @lid (privacidade) e @g.us (grupos) como JID do contato.
router.get('/:id/avatar', async (req, res) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      select: { id: true, phone: true, whatsappId: true, avatarUrl: true },
    });
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

    const url = await sessionManager.getAvatarUrl(contact.whatsappId, contact.phone);
    if (!url) return res.status(404).json({ error: 'Sem foto de perfil' });

    if (url !== contact.avatarUrl) {
      prisma.contact.update({ where: { id: contact.id }, data: { avatarUrl: url } }).catch(() => {});
    }

    return res.redirect(url);
  } catch {
    return res.status(404).json({ error: 'Sem foto de perfil' });
  }
});

router.use(authMiddleware);

router.get('/', async (req, res, next) => {
  try {
    const whatsappId = req.query.whatsappId as string;
    if (!whatsappId) throw new Error('whatsappId é obrigatório');
    const result = await listContacts({
      whatsappId,
      search: req.query.search as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().trim().max(120).optional(),
      notes: z.string().max(5000).optional(),
    }).parse(req.body);
    const contact = await updateContact(req.params.id, body);
    res.json(contact);
  } catch (err) {
    next(err);
  }
});

export default router;
