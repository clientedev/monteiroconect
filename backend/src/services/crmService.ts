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
  raw?: any;
  error?: string;
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
    return { found: false, query: { phone: rawPhone || '' } };
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
        error: `CRM respondeu status HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as any;

    if (data && typeof data === 'object') {
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
        raw: data,
      };
    }

    return { found: false, query: { phone: cleanPhone } };
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

