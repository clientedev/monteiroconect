import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { logger } from '../utils/logger.js';

/**
 * Assistente de IA (Google Gemini) treinado para atender exclusivamente como
 * consultor da Monteiro Corretora: seguros e planos de saúde.
 */
const SYSTEM_PROMPT = `Você é o assistente virtual de atendimento da Monteiro Corretora, uma corretora de seguros e planos de saúde brasileira.

REGRAS DE IDENTIDADE:
- Você atende em nome da Monteiro Corretora. Nunca revele que é uma IA baseada em Gemini, Google ou qualquer tecnologia específica. Se perguntarem, diga que é o assistente virtual da Monteiro Corretora.
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

/**
 * Modelos de fallback — se o modelo configurado não estiver disponível no Gemini
 * (404/400), tenta o próximo. O primeiro que responder é usado.
 */
const FALLBACK_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite'];

type GeminiContent = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

async function callGemini(
  model: string,
  contents: GeminiContent[],
): Promise<{ ok: true; reply: string } | { ok: false; status: number; body: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(
      `${env.geminiBaseUrl}/models/${encodeURIComponent(model)}:generateContent`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.geminiApiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 400,
        },
      }),
      signal: controller.signal,
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, status: res.status, body: body.slice(0, 500) };
    }

    const data = await res.json() as any;
    const reply: string | undefined = data.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('')
      .trim();
    if (!reply) return { ok: false, status: 502, body: 'Resposta vazia da API' };
    return { ok: true, reply };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, status: 408, body: 'Timeout de 30s' };
    return { ok: false, status: 0, body: err?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateAiReply(conversationId: string, incomingText: string): Promise<string | null> {
  if (!env.geminiApiKey) {
    logger.warn('GEMINI_API_KEY não configurada — IA do chatbot desativada');
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

    const contents: GeminiContent[] = [];
    for (const message of history) {
      const text = (message.content || '').slice(0, 2000).trim();
      if (!text) continue;
      const role: GeminiContent['role'] = message.isFromMe ? 'model' : 'user';
      const previous = contents[contents.length - 1];
      if (previous?.role === role) {
        previous.parts[0].text += `\n${text}`;
      } else {
        contents.push({ role, parts: [{ text }] });
      }
    }

    // Garante que a mensagem atual seja a última da conversa
    const currentText = incomingText.slice(0, 2000).trim();
    const last = contents[contents.length - 1];
    if (!last || last.role !== 'user' || last.parts[0].text !== currentText) {
      if (last?.role === 'user') {
        last.parts[0].text += `\n${currentText}`;
      } else {
        contents.push({ role: 'user', parts: [{ text: currentText }] });
      }
    }

    // A API Gemini exige que o primeiro item do histórico seja do usuário.
    while (contents[0]?.role === 'model') contents.shift();

    const models = [env.geminiModel, ...FALLBACK_MODELS.filter(m => m !== env.geminiModel)];
    for (const model of models) {
      const r = await callGemini(model, contents);
      if (r.ok) return r.reply;
      if (r.status === 404 || r.status === 400) {
        logger.error(`Gemini modelo "${model}" indisponível (HTTP ${r.status}): ${r.body.slice(0, 200)} — tentando próximo modelo`);
        continue;
      }
      logger.error(`Gemini API erro ${r.status}: ${r.body.slice(0, 200)}`);
      return null; // erro de auth/servidor — outros modelos não vão ajudar
    }
    return null;
  } catch (err: any) {
    logger.error('Erro ao chamar Gemini API:', err?.message || err);
    return null;
  }
}

/**
 * Testa a conexão com o Gemini — usado pelo botão "Testar IA" no painel.
 */
export async function testAiConnection(): Promise<{ ok: boolean; model?: string; error?: string }> {
  if (!env.geminiApiKey) {
    return { ok: false, error: 'GEMINI_API_KEY não configurada no servidor. Adicione a variável no Railway.' };
  }

  const models = [env.geminiModel, ...FALLBACK_MODELS.filter(m => m !== env.geminiModel)];
  let lastError = '';
  for (const model of models) {
    const r = await callGemini(model, [{ role: 'user', parts: [{ text: 'Responda apenas: ok' }] }]);
    if (r.ok) return { ok: true, model };
    lastError = `HTTP ${r.status}: ${r.body.slice(0, 200)}`;
    if (r.status === 401 || r.status === 403) {
      return { ok: false, error: 'Chave da API inválida ou sem permissão. Verifique a GEMINI_API_KEY.' };
    }
  }
  return { ok: false, error: lastError || 'Falha desconhecida' };
}
