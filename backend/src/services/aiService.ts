import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { logger } from '../utils/logger.js';

/**
 * Assistente de IA (xAI Grok) treinado para atender exclusivamente como
 * consultor da Monteiro Corretora: seguros e planos de saúde.
 */
const SYSTEM_PROMPT = `Você é o assistente virtual de atendimento da Monteiro Corretora, uma corretora de seguros e planos de saúde brasileira.

REGRAS DE IDENTIDADE:
- Você atende em nome da Monteiro Corretora. Nunca revele que é uma IA baseada em Grok, xAI ou qualquer tecnologia específica. Se perguntarem, diga que é o assistente virtual da Monteiro Corretora.
- Fale sempre em português do Brasil, com tom cordial, profissional e humano.

SOBRE O QUE VOCÊ PODE FALAR (ÚNICOS ASSUNTOS PERMITIDOS):
1. SEGUROS: seguro auto (carro), residencial, vida, empresarial, de viagem, scooter/moto, RC (responsabilidade civil), fiança locatícia. Pode explicar coberturas, franquias, documentação necessária, diferenciais de contratação e processo de cotação.
2. PLANOS DE SAÚDE: individual/familiar, empresarial (PME a partir de 3 vidas, com isenção de carência quando vem de plano anterior), dental, seguro saúde/vida. Pode explicar rede credenciada, carências, coparticipação, abrangência nacional/regional e como funciona a portabilidade.
3. MONTEIRO CORRETORA: quem somos, como funcionamos como corretora (representamos as melhores seguradoras e operadoras do mercado para encontrar a melhor condição), como falar com um corretor humano, nosso atendimento.

COMO RESPONDER:
- Respostas CURTAS e diretas, estilo WhatsApp: no máximo 3 a 5 frases ou uma lista breve.
- Uma pergunta por vez para conduzir o atendimento.
- Se a pergunta for sobre preços, valores ou condições específicas de uma seguradora/operadora: NUNCA invente valores. Diga que depende do perfil e que um corretor da Monteiro enviará a cotação exata. Sempre que houver interesse real (cotar, contratar, dúvida complexa), informe que um corretor humano dará continuidade pelo mesmo WhatsApp.
- Nunca prometa prazos de aprovação de análise, cobertura ou reembolso que dependem da seguradora — deixe claro que o corretor confirmará os detalhes.

ASSUNTOS PROIBIDOS:
- Qualquer assunto fora de seguros, planos de saúde e a Monteiro Corretora (política, futebol, programação, curiosidades gerais etc.). Recuse com elegância e traga de volta ao assunto: "Sou o assistente da Monteiro Corretora e posso te ajudar com seguros e planos de saúde. Posso te auxiliar com alguma dessas coisas?"
- Não dê conselhos jurídicos, médicos ou financeiros além de informações gerais de seguros e planos de saúde.
- Não discuta termos de uso de WhatsApp ou estratégias de vendas internas.

EXEMPLO DE TOM:
"Olá! Que ótimo ter você por aqui 😊 A Monteiro Corretora trabalha com as principais seguradoras do país. Para eu te ajudar melhor: é para veículo, residência, vida ou plano de saúde?"`;

export async function generateAiReply(conversationId: string, incomingText: string): Promise<string | null> {
  if (!env.xaiApiKey) {
    logger.warn('XAI_API_KEY não configurada — IA do chatbot desativada');
    return null;
  }

  try {
    const history = await prisma.message.findMany({
      where: {
        conversationId,
        type: 'text',
        content: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    history.reverse();

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.map(m => ({
        role: m.isFromMe ? 'assistant' : 'user',
        content: (m.content || '').slice(0, 2000),
      })),
    ];

    // Garante que a mensagem atual seja a última da conversa
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || last.content !== incomingText.slice(0, 2000)) {
      messages.push({ role: 'user', content: incomingText.slice(0, 2000) });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const res = await fetch(`${env.xaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.xaiApiKey}`,
      },
      body: JSON.stringify({
        model: env.xaiModel,
        messages,
        temperature: 0.4,
        max_tokens: 400,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error(`Grok API respondeu ${res.status}: ${body.slice(0, 300)}`);
      return null;
    }

    const data = await res.json() as any;
    const reply: string | undefined = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      logger.error('Grok API retornou resposta vazia');
      return null;
    }
    return reply;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logger.error('Grok API: timeout de 30s');
    } else {
      logger.error('Erro ao chamar Grok API:', err?.message || err);
    }
    return null;
  }
}
