import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface CrmContactInfo {
  name: string;
  type?: string;
  email?: string;
  document?: string;
  status?: string;
  anniversaryDate?: string;
  assignedTo?: {
    name?: string;
  };
}

export interface CrmPolicyItem {
  insurer?: string;
  product?: string;
  policyNumber?: string;
  expirationDate?: string;
  [key: string]: any;
}

export interface CrmInsuranceInfo {
  activePoliciesCount: number;
  totalAnnualPremiumFormatted?: string;
  policies: CrmPolicyItem[];
}

export interface CrmDealItem {
  product?: string;
  valueFormatted?: string;
  value?: number;
  status?: string;
  [key: string]: any;
}

export interface CrmPipelineInfo {
  activeDealsCount: number;
  deals: CrmDealItem[];
}

export interface CrmLookupResponse {
  found: boolean;
  query?: { phone?: string };
  contact?: CrmContactInfo;
  insurance?: CrmInsuranceInfo;
  pipeline?: CrmPipelineInfo;
  products?: string[];
  raw?: any;
  error?: string;
}

/**
 * Consolida os produtos do cliente cadastrado no CRM.
 * Damos prioridade MÁXIMA aos produtos da tela base de cadastro do contato no CRM
 * (como "Vida", "Saúde", "Auto", "Residencial", etc.).
 */
export function extractProductsFromCrm(data: any): string[] {
  if (!data || typeof data !== 'object') return [];
  const productsSet = new Set<string>();

  const c = data.contact || data;

  // Helper interno para adicionar strings, arrays ou objetos sem duplicidade
  const addValue = (val: any) => {
    if (!val) return;
    if (typeof val === 'string' && val.trim()) {
      const clean = val.trim();
      if (clean.toUpperCase() !== 'PF' && clean.toUpperCase() !== 'PJ') {
        productsSet.add(clean);
      }
    } else if (Array.isArray(val)) {
      val.forEach(addValue);
    } else if (typeof val === 'object') {
      const name = val.name || val.product || val.produto || val.ramo || val.title || val.nome || val.label || val.tag;
      if (name && typeof name === 'string' && name.trim()) {
        const clean = name.trim();
        if (clean.toUpperCase() !== 'PF' && clean.toUpperCase() !== 'PJ') {
          productsSet.add(clean);
        }
      }
    }
  };

  // 1. Prioridade Total: Produtos da tela base de cadastro do Contato no CRM (Vida, Saúde, Auto, Ramo...)
  if (c) {
    addValue(c.product);
    addValue(c.products);
    addValue(c.produto);
    addValue(c.produtos);
    addValue(c.ramo);
    addValue(c.ramos);
    addValue(c.ramoSeguro);
    addValue(c.insuranceType);
    addValue(c.tipoSeguro);
    addValue(c.category);
    addValue(c.categoria);
    addValue(c.tags);
    addValue(c.etiquetas);
  }

  // Raiz do objeto CRM
  addValue(data.product);
  addValue(data.products);
  addValue(data.produto);
  addValue(data.produtos);
  addValue(data.ramo);
  addValue(data.ramos);

  // 2. Se a tela base de contato não continha produtos, busca produtos das apólices ativas
  if (productsSet.size === 0) {
    const policies = Array.isArray(data.insurance?.policies) ? data.insurance.policies : [];
    for (const pol of policies) {
      const pName = pol.product || pol.produto || pol.ramo || pol.name || pol.insuranceType || pol.tipo;
      if (pName && typeof pName === 'string' && pName.trim()) {
        const clean = pName.trim();
        if (clean.toUpperCase() !== 'PF' && clean.toUpperCase() !== 'PJ') {
          productsSet.add(clean);
        }
      }
    }
  }

  // 3. Se ainda não encontrou produtos, busca no funil de vendas
  if (productsSet.size === 0) {
    const deals = Array.isArray(data.pipeline?.deals) ? data.pipeline.deals : [];
    for (const deal of deals) {
      const pName = deal.product || deal.produto || deal.ramo || deal.title || deal.name;
      if (pName && typeof pName === 'string' && pName.trim()) {
        const clean = pName.trim();
        if (clean.toUpperCase() !== 'PF' && clean.toUpperCase() !== 'PJ') {
          productsSet.add(clean);
        }
      }
    }
  }

  return Array.from(productsSet);
}

/**
 * Normaliza o número de telefone extraindo apenas dígitos.
 */
export function normalizePhoneForCrm(phone: string): string {
  if (!phone) return '';
  // Remove sufixos como @s.whatsapp.net ou @g.us
  const raw = phone.split('@')[0];
  // Mantém apenas os números
  return raw.replace(/\D/g, '');
}

/**
 * Consulta a API do CRM da Monteiro Seguros por telefone.
 * GET {CRM_BASE_URL}/api/v1/external/contacts/lookup?phone={{remoteJid_ou_numero_whatsapp}}
 * Header: X-API-Key: {{CRM_API_KEY}}
 */
export async function lookupContactInCrm(rawPhone: string): Promise<CrmLookupResponse> {
  const cleanPhone = normalizePhoneForCrm(rawPhone);

  if (!cleanPhone) {
    return { found: false, query: { phone: rawPhone || '' }, products: [] };
  }

  const crmUrl = `${env.crmBaseUrl}/api/v1/external/contacts/lookup?phone=${encodeURIComponent(cleanPhone)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    logger.info(`Consultando CRM Monteiro Seguros: phone=${cleanPhone} (URL: ${crmUrl})`);

    const res = await fetch(crmUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': env.crmApiKey,
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn(`API CRM respondeu status ${res.status}: ${errText.slice(0, 200)}`);
      return {
        found: false,
        query: { phone: cleanPhone },
        products: [],
        error: `CRM respondeu status HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as any;

    if (data && typeof data === 'object') {
      const products = extractProductsFromCrm(data);
      return {
        found: Boolean(data.found),
        query: data.query || { phone: cleanPhone },
        contact: data.contact,
        insurance: data.insurance ? {
          activePoliciesCount: data.insurance.activePoliciesCount ?? data.insurance.policies?.length ?? 0,
          totalAnnualPremiumFormatted: data.insurance.totalAnnualPremiumFormatted || 'R$ 0,00',
          policies: Array.isArray(data.insurance.policies) ? data.insurance.policies : [],
        } : undefined,
        pipeline: data.pipeline ? {
          activeDealsCount: data.pipeline.activeDealsCount ?? data.pipeline.deals?.length ?? 0,
          deals: Array.isArray(data.pipeline.deals) ? data.pipeline.deals : [],
        } : undefined,
        products,
        raw: data,
      };
    }

    return { found: false, query: { phone: cleanPhone }, products: [] };

  } catch (err: any) {
    if (err?.name === 'AbortError') {
      logger.error(`Timeout de 10s na consulta CRM (${cleanPhone})`);
      return { found: false, query: { phone: cleanPhone }, error: 'Timeout ao conectar com o CRM (10s)' };
    }
    logger.error(`Erro ao consultar CRM (${cleanPhone}):`, err?.message || err);
    return { found: false, query: { phone: cleanPhone }, error: err?.message || 'Falha na conexão com o CRM' };
  } finally {
    clearTimeout(timeout);
  }
}

export interface CreateCrmContactInput {
  name: string;
  phone: string;
  type?: string;
  email?: string;
  document?: string;
  status?: string;
  anniversaryDate?: string;
  secondaryPhone?: string;
  assignedToName?: string;

  // Endereço
  zipCode?: string;
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;

  // Apólice Inicial / Produto
  product?: string;
  insurer?: string;
  policyNumber?: string;
  premiumValue?: string | number;
  expirationDate?: string;

  // Funil / Negócio
  dealProduct?: string;
  dealValue?: string | number;
  dealStatus?: string;
  notes?: string;
}

/**
 * Cadastra um novo contato no CRM da Monteiro Seguros.
 * POST {CRM_BASE_URL}/api/v1/external/contacts
 * Header: X-API-Key: {{CRM_API_KEY}}
 */
export async function createContactInCrm(input: CreateCrmContactInput): Promise<{ ok: boolean; data?: any; error?: string }> {
  const cleanPhone = normalizePhoneForCrm(input.phone);
  if (!cleanPhone) {
    return { ok: false, error: 'Telefone inválido para cadastro no CRM' };
  }

  const crmUrl = `${env.crmBaseUrl}/api/v1/external/contacts`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    logger.info(`Cadastrando novo contato no CRM Monteiro Seguros: phone=${cleanPhone}, name=${input.name}`);

    const res = await fetch(crmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': env.crmApiKey,
      },
      body: JSON.stringify({
        name: input.name,
        phone: cleanPhone,
        type: input.type || 'PF',
        email: input.email || undefined,
        document: input.document || undefined,
        status: input.status || 'Ativo',
        anniversaryDate: input.anniversaryDate || undefined,
        secondaryPhone: input.secondaryPhone ? normalizePhoneForCrm(input.secondaryPhone) : undefined,
        assignedToName: input.assignedToName || undefined,

        // Produto / Ramo no cadastro base do contato
        product: input.product || undefined,
        products: input.product ? [input.product] : undefined,
        produto: input.product || undefined,
        ramo: input.product || undefined,

        // Endereço
        zipCode: input.zipCode || undefined,
        address: input.address || undefined,
        number: input.number || undefined,
        complement: input.complement || undefined,
        neighborhood: input.neighborhood || undefined,
        city: input.city || undefined,
        state: input.state || undefined,

        // Apólice / Seguro inicial
        insurance: input.product ? {
          product: input.product,
          insurer: input.insurer || undefined,
          policyNumber: input.policyNumber || undefined,
          premiumValue: input.premiumValue || undefined,
          expirationDate: input.expirationDate || undefined,
        } : undefined,

        // Negócio no Funil
        pipeline: input.dealProduct ? {
          product: input.dealProduct,
          value: input.dealValue || undefined,
          status: input.dealStatus || 'Cotação',
        } : undefined,

        notes: input.notes || undefined,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn(`API CRM cadastro respondeu status ${res.status}: ${errText.slice(0, 200)}`);
      return { ok: false, error: `CRM respondeu erro (HTTP ${res.status}): ${errText.slice(0, 150) || 'Falha ao cadastrar'}` };
    }

    const data = (await res.json()) as any;
    return { ok: true, data };

  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'Timeout de 10s ao cadastrar no CRM' };
    }
    logger.error(`Erro ao cadastrar contato no CRM (${cleanPhone}):`, err?.message || err);
    return { ok: false, error: err?.message || 'Falha de conexão com o CRM' };
  } finally {
    clearTimeout(timeout);
  }
}


/**
 * Consulta a API do CRM para múltiplos telefones em lote.
 */
export async function batchLookupContactsInCrm(phones: string[]): Promise<Record<string, CrmLookupResponse>> {
  const uniquePhones = Array.from(new Set(phones.filter(Boolean)));
  const results: Record<string, CrmLookupResponse> = {};

  const BATCH_SIZE = 10;
  for (let i = 0; i < uniquePhones.length; i += BATCH_SIZE) {
    const chunk = uniquePhones.slice(i, i + BATCH_SIZE);
    const chunkResults = await Promise.all(
      chunk.map(phone => lookupContactInCrm(phone))
    );
    chunk.forEach((phone, idx) => {
      results[phone] = chunkResults[idx];
    });
  }

  return results;
}

