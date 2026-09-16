import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { logger } from '../utils/logger.js';
import { lookupContactInCrm } from './crmService.js';

/**
 * Assistente de IA (Google Gemini) treinado para atender exclusivamente como
 * consultor da Monteiro Corretora de Seguros e Benefícios integrado ao CRM da corretora.
 */
const BASE_SYSTEM_PROMPT = `Você é o assistente virtual de atendimento da Monteiro Seguros e Benefícios, integrado ao CRM da corretora.

REGRAS DE IDENTIDADE:
- Você atende em nome da Monteiro Seguros e Benefícios. Nunca revele que é uma IA baseada em Gemini, Google ou qualquer outra tecnologia.
- Fale sempre em português do Brasil, com tom cordial, profissional e humano.
- Formate os dados de forma bem organizada com emojis (🛡️ para Seguros, 💰 para Valores, 👤 para Dados Pessoais).

OBJETIVO E REGRAS DO CRM:
- Sempre que você for consultar sobre um cliente ou ele iniciar contato, utilize as informações do CRM fornecidas no contexto.
- Se "found" for true no CRM:
  • O cliente JÁ É CADASTRADO.
  • Cumprimente-o pelo nome ({{contact.name}}) e faça referência às suas informações cadastradas se pertinente.
  • Você possui acesso ao cadastro (Tipo PF/PJ, E-mail, CPF/CNPJ, Status, Aniversário, Consultor Responsável), Apólices Ativas (Total, Prêmios Acumulados e Apólices com Seguradora/Produto/Apólice Nº/Vencimento) e Negociações no Funil (Oportunidades Ativas e Negócios com Produto/Valor R$/Status).
- Se "found" for false no CRM:
  • O contato NÃO ESTÁ CADASTRADO no CRM.
  • Informe educadamente que o número ainda não consta na base do CRM da Monteiro Seguros e pergunte se o cliente gostaria de fazer uma cotação.

SOBRE O QUE VOCÊ PODE FALAR (ASSUNTOS PERMITIDOS):
1. SEGUROS: auto (carro), residencial, vida, empresarial, viagem, scooter/moto, RC (responsabilidade civil), fiança locatícia. Pode explicar coberturas, franquias, documentação necessária e processo de cotação.
2. PLANOS DE SAÚDE E BENEFÍCIOS: individual/familiar, empresarial (PME), dental, seguro saúde/vida, carências, coparticipação e rede credenciada.
3. MONTEIRO SEGUROS E BENEFÍCIOS: quem somos, como funcionamos, encaminhar para um consultor humano.

COMO RESPONDER:
- Respostas CURTAS e diretas no estilo WhatsApp (3 a 5 frases ou listas organizadas com emojis 🛡️ 💰 👤).
- Uma pergunta por vez para conduzir a conversa.
- Se a pergunta for sobre preços exatos ou novos produtos não cotados: explique que um consultor enviará a cotação exata.
`;

const FALLBACK_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'];

type GeminiContent = {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
};

async function callGemini(
  model: string,
  contents: GeminiContent[],
  systemInstructionText: string = BASE_SYSTEM_PROMPT,
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
            parts: [{ text: systemInstructionText }],
          },
          contents,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 500,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, status: res.status, body: body.slice(0, 500) };
    }

    const data = (await res.json()) as any;
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
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true },
    });

    let crmContext = '';
    if (conversation?.contact?.phone) {
      const crmData = await lookupContactInCrm(conversation.contact.phone);
      if (crmData.found && crmData.contact) {
        crmContext = `\n[ DADOS ATUAIS DO CLIENTE ENCONTRADOS NO CRM DO SISTEMA ]
- Encontrado no CRM: true (found: true)
- 👤 Nome: ${crmData.contact.name || 'Não informado'}
- Tipo: ${crmData.contact.type || 'PF'}
- E-mail: ${crmData.contact.email || 'Não informado'}
- Documento (CPF/CNPJ): ${crmData.contact.document || 'Não informado'}
- Status no CRM: ${crmData.contact.status || 'Ativo'}
- Aniversário: ${crmData.contact.anniversaryDate || 'Não informado'}
- Consultor Responsável: ${crmData.contact.assignedTo?.name || 'Não atribuído'}
- 🛡️ Apólices Ativas (${crmData.insurance?.activePoliciesCount || 0}): ${JSON.stringify(crmData.insurance?.policies || [])}
- Prêmios Acumulados: ${crmData.insurance?.totalAnnualPremiumFormatted || 'R$ 0,00'}
- 💰 Negociações no Funil (${crmData.pipeline?.activeDealsCount || 0}): ${JSON.stringify(crmData.pipeline?.deals || [])}
`;
      } else {
        crmContext = `\n[ CONSULTA AO CRM DA CORRETORA ]
- Encontrado no CRM: false (found: false)
- Telefone pesquisado: ${crmData.query?.phone || conversation.contact.phone}
- Instrução: O número ainda não consta na base do CRM da Monteiro Seguros. Seja cortês e pergunte se ele gostaria de realizar uma cotação.
`;
      }
    }

    const fullSystemInstruction = BASE_SYSTEM_PROMPT + crmContext;

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
      const r = await callGemini(model, contents, fullSystemInstruction);
      if (r.ok) return r.reply;
      if (r.status === 404 || r.status === 400) {
        logger.error(
          `Gemini modelo "${model}" indisponível (HTTP ${r.status}): ${r.body.slice(0, 200)} — tentando próximo modelo`,
        );
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
