import { Router } from 'express';
import { listContacts, updateContact } from '../services/contactService.js';
import { lookupContactInCrm, batchLookupContactsInCrm, createContactInCrm, createOpportunityInCrm } from '../services/crmService.js';
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

router.post('/crm-create', async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().trim().min(2, 'Nome é obrigatório'),
      phone: z.string().trim().min(8, 'Telefone é obrigatório'),
      type: z.string().trim().optional(),
      email: z.string().trim().optional(),
      document: z.string().trim().optional(),
      status: z.string().trim().optional(),
      anniversaryDate: z.string().trim().optional(),
      secondaryPhone: z.string().trim().optional(),
      assignedToName: z.string().trim().optional(),
      zipCode: z.string().trim().optional(),
      address: z.string().trim().optional(),
      number: z.string().trim().optional(),
      complement: z.string().trim().optional(),
      neighborhood: z.string().trim().optional(),
      city: z.string().trim().optional(),
      state: z.string().trim().optional(),
      product: z.string().trim().optional(),
      produto: z.string().trim().optional(),
      produtos: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
      insurer: z.string().trim().optional(),
      policyNumber: z.string().trim().optional(),
      premiumValue: z.union([z.string(), z.number()]).optional(),
      expirationDate: z.string().trim().optional(),
      dealProduct: z.string().trim().optional(),
      dealValue: z.union([z.string(), z.number()]).optional(),
      dealStatus: z.string().trim().optional(),
      notes: z.string().trim().optional(),
    }).parse(req.body);

    const result = await createContactInCrm(body);
    if (result.ok) {
      const cleanPhone = body.phone.replace(/\D/g, '');
      if (cleanPhone) {
        await prisma.contact.updateMany({
          where: {
            OR: [
              { phone: body.phone },
              { phone: cleanPhone },
              { phone: { contains: cleanPhone } },
            ],
          },
          data: {
            name: body.name,
            notes: body.notes || undefined,
          },
        }).catch(() => {});
      }
    } else {
      return res.status(400).json({ error: result.error || 'Falha ao cadastrar contato no CRM' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/crm-deal', async (req, res, next) => {
  try {
    const body = z.object({
      phone: z.string().trim().min(8, 'Telefone é obrigatório'),
      name: z.string().trim().optional(),
      dealProduct: z.string().trim().min(1, 'Produto da oportunidade é obrigatório'),
      dealValue: z.union([z.string(), z.number()]).optional(),
      dealStatus: z.string().trim().optional(),
      dealDate: z.string().trim().optional(),
      notes: z.string().trim().optional(),
    }).parse(req.body);

    const result = await createOpportunityInCrm(body);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Falha ao criar oportunidade no LEADS & Pipeline do CRM' });
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/crm-batch-lookup', async (req, res, next) => {
  try {
    const phones = req.body?.phones as string[];
    if (!Array.isArray(phones)) {
      return res.status(400).json({ error: 'Parâmetro phones deve ser um array' });
    }
    const results = await batchLookupContactsInCrm(phones);
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

router.get('/crm-lookup', async (req, res, next) => {
  try {
    const phone = req.query.phone as string;
    if (!phone) {
      return res.status(400).json({ error: 'Parâmetro phone é obrigatório' });
    }
    const crmData = await lookupContactInCrm(phone);
    res.json(crmData);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/crm', async (req, res, next) => {
  try {
    const contact = await prisma.contact.findUnique({
      where: { id: req.params.id },
      select: { id: true, phone: true },
    });
    if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
    const crmData = await lookupContactInCrm(contact.phone);
    res.json(crmData);
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

