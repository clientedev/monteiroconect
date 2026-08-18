import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import * as chatbotService from '../services/chatbotService.js';
import { testAiConnection } from '../services/aiService.js';

const router = Router();
router.use(authMiddleware);

// Testa a conexão com a IA da Grok — antes das rotas /:id
router.post('/test-ai', async (_req, res, next) => {
  try {
    const result = await testAiConnection();
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const whatsappAccountId = req.query.whatsappAccountId as string | undefined;
    const chatbots = await chatbotService.listChatbots(whatsappAccountId);
    res.json(chatbots);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const chatbot = await chatbotService.getChatbot(String(req.params.id));
    res.json(chatbot);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const chatbot = await chatbotService.createChatbot(req.body);
    res.status(201).json(chatbot);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const chatbot = await chatbotService.updateChatbot(String(req.params.id), req.body);
    res.json(chatbot);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await chatbotService.deleteChatbot(String(req.params.id));
    res.json(result);
  } catch (err) { next(err); }
});

router.post('/:id/toggle', async (req, res, next) => {
  try {
    const chatbot = await chatbotService.toggleChatbot(String(req.params.id));
    res.json(chatbot);
  } catch (err) { next(err); }
});

router.post('/:id/replies', async (req, res, next) => {
  try {
    const reply = await chatbotService.addAutoReply(String(req.params.id), req.body);
    res.status(201).json(reply);
  } catch (err) { next(err); }
});

router.put('/replies/:replyId', async (req, res, next) => {
  try {
    const reply = await chatbotService.updateAutoReply(String(req.params.replyId), req.body);
    res.json(reply);
  } catch (err) { next(err); }
});

router.delete('/replies/:replyId', async (req, res, next) => {
  try {
    const result = await chatbotService.deleteAutoReply(String(req.params.replyId));
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
