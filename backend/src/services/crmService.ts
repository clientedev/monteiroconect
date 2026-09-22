import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../database/client.js';
import {
  getLocalCrmContact,
  saveLocalCrmContact,
  addLocalCrmDeal,
  syncLocalCrmDeals,
  deleteLocalCrmContact,
  LocalCrmContactRecord,
} from './crmLocalStore.js';

export interface CrmContactInfo {
  id?: string | number;
  name: string;
  type?: string;
  email?: string;
  document?: string;
  status?: string;
  anniversaryDate?: string;
  assignedTo?: {
    id?: string;
    name?: string;
    email?: string;
  };
}

export interface CrmPolicyItem {
  id?: string | number;
  insurer?: string;
  product?: string;
  policyNumber?: string;
  expirationDate?: string;
  premiumValue?: number;
  premiumValueFormatted?: string;
  crmUrl?: string;
  [key: string]: any;
}

export interface CrmInsuranceInfo {
  activePoliciesCount: number;
  totalAnnualPremiumFormatted?: string;
  policies: CrmPolicyItem[];
}

export interface CrmDealItem {
  id?: string;
  product?: string;
  produto?: string;
  title?: string;
  valueFormatted?: string;
  value?: number;
  status?: string;
  etapa?: string;
  date?: string;
  dealDate?: string;
  notes?: string;
  observacoes?: string;
  assignedToName?: string;
  assignedToEmail?: string;
  assignedToId?: string;
  assignedTo?: {
    id?: string;
    name?: string;
    email?: string;
  };
  responded?: boolean;
  createdAt?: string;
  [key: string]: any;
}

export interface CrmUserItem {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface CrmPipelineInfo {
  activeDealsCount: number;
  deals: CrmDealItem[];
}

export interface CrmLookupResponse {
  found: boolean;
  query?: { phone?: string };
  crmBaseUrl?: string;
  clientCrmUrl?: string;
  contact?: CrmContactInfo;
  insurance?: CrmInsuranceInfo;
  pipeline?: CrmPipelineInfo;
  products?: string[];
  raw?: any;
  error?: string;
}

/**
 * Utilitário para converter valores monetários (ex: "3.500,00", "R$ 2.450,50") em número Float válido.
 */
export function parseCurrency(val: any): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  if (typeof val === 'number') return isNaN(val) ? undefined : val;
  if (typeof val === 'string') {
    const clean = val.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}

/**
 * Utilitário para formatar números em Real Brasileiro (R$ 0.000,00).
 */
export function formatCurrency(num: number | undefined): string | undefined {
  if (num === undefined || num === null || isNaN(num)) return undefined;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
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
      if (clean.includes(',')) {
        clean.split(',').map(s => s.trim()).filter(Boolean).forEach(addValue);
        return;
      }
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
 * Constrói resposta a partir do cache local quando o CRM está indisponível ou não possui os dados salvos.
 */
function buildResponseFromLocal(cleanPhone: string, local: LocalCrmContactRecord): CrmLookupResponse {
  const deals = (local.deals || []).map(d => ({
    id: d.id,
    product: d.product,
    produto: d.produto || d.product,
    title: d.title || d.product,
    value: d.value,
    valueFormatted: d.valueFormatted || (d.value ? formatCurrency(d.value) : undefined),
    status: d.status || 'Respondida',
    etapa: d.etapa || d.status || 'Respondida',
    date: d.date || d.dealDate,
    dealDate: d.dealDate || d.date,
    notes: d.notes,
    assignedToName: d.assignedToName,
    assignedToEmail: d.assignedToEmail,
    assignedToId: d.assignedToId,
    assignedTo: d.assignedToName ? {
      name: d.assignedToName,
      email: d.assignedToEmail,
      id: d.assignedToId,
    } : undefined,
    responded: d.responded ?? true,
    createdAt: d.createdAt,
  }));

  const policies = local.insurance ? [{
    product: local.insurance.product,
    insurer: local.insurance.insurer,
    policyNumber: local.insurance.policyNumber,
    premiumValue: local.insurance.premiumValue,
    premiumValueFormatted: local.insurance.premiumValueFormatted,
    expirationDate: local.insurance.expirationDate,
  }] : [];

  const products = Array.from(new Set([
    ...(local.produtos || []),
    ...(local.product ? [local.product] : []),
  ]));

  return {
    found: true,
    query: { phone: cleanPhone },
    contact: {
      name: local.name || 'Contato WhatsApp',
      type: local.type || 'PF',
      email: local.email,
      document: local.document,
      status: local.status || 'Ativo',
      anniversaryDate: local.anniversaryDate,
      assignedTo: local.assignedToName ? { name: local.assignedToName } : undefined,
    },
    insurance: {
      activePoliciesCount: policies.length,
      totalAnnualPremiumFormatted: local.insurance?.premiumValueFormatted || 'R$ 0,00',
      policies,
    },
    pipeline: {
      activeDealsCount: deals.length,
      deals,
    },
    products,
    raw: {
      ...local,
      source: 'wa_local_store',
    },
  };
}

/**
 * Consulta a API do CRM da Monteiro Seguros por telefone,
 * mesclando com o armazenamento local persistente do sistema Whats.
 * GET {CRM_BASE_URL}/api/v1/external/contacts/lookup?phone={{remoteJid_ou_numero_whatsapp}}
 * Header: X-API-Key: {{CRM_API_KEY}}
 */
export async function lookupContactInCrm(rawPhone: string): Promise<CrmLookupResponse> {
  const cleanPhone = normalizePhoneForCrm(rawPhone);

  if (!cleanPhone) {
    return { found: false, query: { phone: rawPhone || '' }, products: [] };
  }

  const local = getLocalCrmContact(cleanPhone);
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
      if (local && (local.name || local.deals?.length || local.insurance)) {
        return buildResponseFromLocal(cleanPhone, local);
      }
      return {
        found: false,
        query: { phone: cleanPhone },
        products: [],
        error: `CRM respondeu status HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as any;

    if (data && typeof data === 'object') {
      const isFound = Boolean(data.found);

      // Se o CRM respondeu com sucesso que o contato não foi encontrado (ou foi excluído no CRM)
      if (!isFound) {
        deleteLocalCrmContact(cleanPhone);
        return {
          found: false,
          query: { phone: cleanPhone },
          products: [],
        };
      }

      // CRM é a autoridade máxima: produtos do CRM
      const products = extractProductsFromCrm(data);
      const mergedProducts = Array.from(new Set([
        ...products,
        ...(data.contact?.product ? [data.contact.product] : []),
      ]));

      // Identifica ID do cliente no CRM para redirecionamento direto (/admin/clientes/{id})
      const contactObj = data.contact || data;
      const clienteId = contactObj.id ?? data.id ?? data.clienteId ?? contactObj.clienteId ?? data.contactId;
      const clientCrmUrl = clienteId ? `${env.crmBaseUrl}/admin/clientes/${clienteId}` : undefined;

      // Mescla apólices e prêmios do CRM
      const policies = Array.isArray(data.insurance?.policies)
        ? data.insurance.policies.map((p: any) => {
            const numVal = parseCurrency(p.premiumValue || p.premio || p.valor);
            const valFmt = p.premiumValueFormatted || formatCurrency(numVal);
            return {
              id: p.id || p.policyId || p.apoliceId,
              insurer: p.insurer || p.seguradora || p.companhia,
              product: p.product || p.ramo || p.produto,
              policyNumber: p.policyNumber || p.numeroApolice || p.apolice,
              expirationDate: p.expirationDate || p.dataVencimento || p.fimVigencia,
              premiumValue: numVal ?? p.premiumValue,
              premiumValueFormatted: valFmt || p.premiumValueFormatted,
              crmUrl: clientCrmUrl,
              ...p,
            };
          })
        : [];

      // Extração robusta do colaborador responsável do contato
      const rawContactAssigned = contactObj.assignedTo ?? contactObj.responsavel ?? contactObj.consultor ?? contactObj.funcionario ?? contactObj.atendente ?? contactObj.user ?? contactObj.assignedUser ?? data.assignedTo ?? data.responsavel;
      let contactAssignedName: string | undefined = undefined;
      let contactAssignedEmail: string | undefined = contactObj.assignedToEmail ?? contactObj.responsavelEmail ?? contactObj.email;
      let contactAssignedId: string | undefined = contactObj.assignedToId ?? contactObj.responsavelId ?? contactObj.userId;

      if (typeof rawContactAssigned === 'string' && rawContactAssigned.trim()) {
        contactAssignedName = rawContactAssigned.trim();
      } else if (rawContactAssigned && typeof rawContactAssigned === 'object') {
        contactAssignedName = rawContactAssigned.name || rawContactAssigned.nome || rawContactAssigned.username || rawContactAssigned.fullName;
        contactAssignedEmail = contactAssignedEmail || rawContactAssigned.email || rawContactAssigned.mail;
        contactAssignedId = contactAssignedId || String(rawContactAssigned.id || rawContactAssigned._id || '');
      } else if (typeof rawContactAssigned === 'number') {
        contactAssignedId = String(rawContactAssigned);
      }
      if (!contactAssignedName) {
        contactAssignedName = contactObj.assignedToName || contactObj.responsavelNome || contactObj.consultorNome || contactObj.funcionarioNome;
      }

      // Oportunidades do funil vindas do CRM
      const crmDeals = Array.isArray(data.pipeline?.deals)
        ? data.pipeline.deals
        : Array.isArray(data.deals)
        ? data.deals
        : Array.isArray(data.opportunities)
        ? data.opportunities
        : [];

      let mergedDeals = crmDeals.map((d: any, idx: number) => {
        const numVal = parseCurrency(d.value || d.valor || d.dealValue);
        const valFmt = d.valueFormatted || formatCurrency(numVal);

        const rawDealAssigned = d.assignedTo ?? d.responsavel ?? d.consultor ?? d.funcionario ?? d.atendente ?? d.user ?? d.assignedUser;
        let dealAssignedName: string | undefined = undefined;
        let dealAssignedEmail: string | undefined = d.assignedToEmail ?? d.responsavelEmail ?? d.consultorEmail;
        let dealAssignedId: string | undefined = d.assignedToId ?? d.responsavelId ?? d.consultorId ?? d.userId;

        if (typeof rawDealAssigned === 'string' && rawDealAssigned.trim()) {
          dealAssignedName = rawDealAssigned.trim();
        } else if (rawDealAssigned && typeof rawDealAssigned === 'object') {
          dealAssignedName = rawDealAssigned.name || rawDealAssigned.nome || rawDealAssigned.username || rawDealAssigned.fullName;
          dealAssignedEmail = dealAssignedEmail || rawDealAssigned.email || rawDealAssigned.mail;
          dealAssignedId = dealAssignedId || String(rawDealAssigned.id || rawDealAssigned._id || '');
        } else if (typeof rawDealAssigned === 'number') {
          dealAssignedId = String(rawDealAssigned);
        }

        if (!dealAssignedName) {
          dealAssignedName = d.assignedToName || d.responsavelNome || d.consultorNome || d.funcionarioNome;
        }

        // Se a oportunidade não tiver responsável direto, herda o responsável do contato no CRM
        const finalAssignedName = dealAssignedName || contactAssignedName;
        const finalAssignedEmail = dealAssignedEmail || contactAssignedEmail;
        const finalAssignedId = dealAssignedId || contactAssignedId;

        const assigned = finalAssignedName ? {
          name: finalAssignedName,
          email: finalAssignedEmail,
          id: finalAssignedId,
        } : undefined;

        return {
          id: d.id || `${d.product || 'deal'}-${idx}`,
          product: d.product || d.produto || d.title || 'Oportunidade',
          value: numVal ?? d.value,
          valueFormatted: valFmt || d.valueFormatted,
          status: d.status || d.etapa || d.stage || 'Respondida',
          etapa: d.etapa || d.status || d.stage || 'Respondida',
          assignedTo: assigned,
          assignedToName: finalAssignedName,
          assignedToEmail: finalAssignedEmail,
          assignedToId: finalAssignedId,
          dealDate: d.dealDate || d.date || d.dataRetorno,
          notes: d.notes || d.observacoes,
          responded: d.responded ?? true,
          createdAt: d.createdAt || new Date().toISOString(),
        };
      });

      // Sincroniza o cache local com os dados oficiais do CRM para que exclusões e edições reflitam imediatamente
      syncLocalCrmDeals(cleanPhone, mergedDeals);
      saveLocalCrmContact(cleanPhone, {
        name: data.contact?.name,
        type: data.contact?.type,
        email: data.contact?.email,
        document: data.contact?.document,
        status: data.contact?.status,
        anniversaryDate: data.contact?.anniversaryDate,
        assignedToName: contactAssignedName,
        product: products[0] || undefined,
        produtos: products,
      });

      return {
        found: true,
        query: data.query || { phone: cleanPhone },
        crmBaseUrl: env.crmBaseUrl,
        clientCrmUrl,
        contact: {
          id: clienteId ? String(clienteId) : undefined,
          name: data.contact?.name || '',
          type: data.contact?.type || 'PF',
          email: data.contact?.email,
          document: data.contact?.document,
          status: data.contact?.status || 'Ativo',
          anniversaryDate: data.contact?.anniversaryDate,
          assignedTo: contactAssignedName ? { name: contactAssignedName, email: contactAssignedEmail } : undefined,
        },
        insurance: {
          activePoliciesCount: data.insurance?.activePoliciesCount ?? policies.length,
          totalAnnualPremiumFormatted: data.insurance?.totalAnnualPremiumFormatted || 'R$ 0,00',
          policies,
        },
        pipeline: {
          activeDealsCount: mergedDeals.length,
          deals: mergedDeals,
        },
        products: mergedProducts,
        raw: {
          ...data,
          ...(local ? { localCache: local } : {}),
        },
      };
    }

    if (local && (local.name || local.deals?.length || local.insurance)) {
      return buildResponseFromLocal(cleanPhone, local);
    }

    return { found: false, query: { phone: cleanPhone }, products: [] };

  } catch (err: any) {
    if (local && (local.name || local.deals?.length || local.insurance)) {
      return buildResponseFromLocal(cleanPhone, local);
    }
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
  produto?: string;
  produtos?: string | string[];
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

  const productVal = (
    input.product ||
    input.produto ||
    (typeof input.produtos === 'string'
      ? input.produtos
      : Array.isArray(input.produtos)
      ? input.produtos.join(', ')
      : undefined)
  )?.trim() || undefined;

  // Normalização precisa de valores numéricos (moeda brasileira R$ -> Float)
  const numPremium = parseCurrency(input.premiumValue);
  const strPremiumFormatted = formatCurrency(numPremium) || (input.premiumValue ? String(input.premiumValue) : undefined);

  const numDeal = parseCurrency(input.dealValue);
  const strDealFormatted = formatCurrency(numDeal) || (input.dealValue ? String(input.dealValue) : undefined);

  // 1. GUARDA IMEDIATAMENTE NO SISTEMA WHATS (Persistência Local Confiável)
  try {
    saveLocalCrmContact(cleanPhone, {
      phone: cleanPhone,
      name: input.name,
      type: input.type || 'PF',
      email: input.email || undefined,
      document: input.document || undefined,
      status: input.status || 'Ativo',
      anniversaryDate: input.anniversaryDate || undefined,
      secondaryPhone: input.secondaryPhone ? normalizePhoneForCrm(input.secondaryPhone) : undefined,
      assignedToName: input.assignedToName || undefined,
      zipCode: input.zipCode || undefined,
      address: input.address || undefined,
      number: input.number || undefined,
      complement: input.complement || undefined,
      neighborhood: input.neighborhood || undefined,
      city: input.city || undefined,
      state: input.state || undefined,
      product: productVal,
      produto: productVal,
      produtos: productVal ? [productVal] : undefined,
      insurance: productVal ? {
        product: productVal,
        insurer: input.insurer || undefined,
        policyNumber: input.policyNumber || undefined,
        premiumValue: numPremium,
        premiumValueFormatted: strPremiumFormatted,
        expirationDate: input.expirationDate || undefined,
      } : undefined,
    });

    if (input.dealProduct) {
      addLocalCrmDeal(cleanPhone, {
        product: input.dealProduct,
        produto: input.dealProduct,
        title: input.dealProduct,
        value: numDeal,
        valueFormatted: strDealFormatted,
        status: input.dealStatus || 'Enviar Cotação',
        etapa: input.dealStatus || 'Enviar Cotação',
        notes: input.notes || undefined,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    logger.error('Erro ao gravar contato no armazenamento local Whats:', err?.message);
  }

  // 2. ENVIA PARA A API DO CRM EXTERNO
  const crmUrl = `${env.crmBaseUrl}/api/v1/external/contacts`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    logger.info(`Cadastrando/Atualizando contato no CRM Monteiro Seguros: phone=${cleanPhone}, name=${input.name}`);

    const payload = {
      name: input.name,
      nome: input.name,
      fullName: input.name,
      phone: cleanPhone,
      telefone: cleanPhone,
      whatsapp: cleanPhone,
      type: input.type || 'PF',
      tipo: input.type || 'PF',
      email: input.email || undefined,
      document: input.document || undefined,
      cpf: input.type === 'PJ' ? undefined : (input.document || undefined),
      cnpj: input.type === 'PJ' ? (input.document || undefined) : undefined,
      cpfCnpj: input.document || undefined,
      cpf_cnpj: input.document || undefined,
      status: input.status || 'Ativo',
      anniversaryDate: input.anniversaryDate || undefined,
      birthDate: input.anniversaryDate || undefined,
      dataNascimento: input.anniversaryDate || undefined,
      secondaryPhone: input.secondaryPhone ? normalizePhoneForCrm(input.secondaryPhone) : undefined,
      telefoneSecundario: input.secondaryPhone ? normalizePhoneForCrm(input.secondaryPhone) : undefined,
      assignedToName: input.assignedToName || undefined,
      consultor: input.assignedToName || undefined,
      responsavel: input.assignedToName || undefined,

      // Produto / Ramo no cadastro base do contato (alimenta coluna produtos no CRM)
      product: productVal,
      products: productVal ? [productVal] : undefined,
      produto: productVal,
      produtos: productVal,
      ramo: productVal,
      ramoSeguro: productVal,
      insurer: input.insurer || undefined,
      seguradora: input.insurer || undefined,

      // Endereço
      zipCode: input.zipCode || undefined,
      cep: input.zipCode || undefined,
      address: input.address || undefined,
      rua: input.address || undefined,
      logradouro: input.address || undefined,
      number: input.number || undefined,
      numero: input.number || undefined,
      complement: input.complement || undefined,
      complemento: input.complement || undefined,
      neighborhood: input.neighborhood || undefined,
      bairro: input.neighborhood || undefined,
      city: input.city || undefined,
      cidade: input.city || undefined,
      state: input.state || undefined,
      uf: input.state || undefined,
      estado: input.state || undefined,

      // Apólice / Seguro inicial (enviamos numérico e formatado)
      insurance: productVal ? {
        product: productVal,
        produto: productVal,
        produtos: productVal,
        ramo: productVal,
        insurer: input.insurer || undefined,
        seguradora: input.insurer || undefined,
        policyNumber: input.policyNumber || undefined,
        policy: input.policyNumber || undefined,
        apolice: input.policyNumber || undefined,
        numeroApolice: input.policyNumber || undefined,
        premiumValue: numPremium ?? input.premiumValue ?? undefined,
        premio: numPremium ?? input.premiumValue ?? undefined,
        valorPremio: numPremium ?? input.premiumValue ?? undefined,
        valor: numPremium ?? input.premiumValue ?? undefined,
        premiumValueFormatted: strPremiumFormatted,
        expirationDate: input.expirationDate || undefined,
        vencimento: input.expirationDate || undefined,
        dataVencimento: input.expirationDate || undefined,
      } : undefined,

      // Negócio no Funil (LEADS & Pipeline) - enviamos numérico e formatado
      dealProduct: input.dealProduct || undefined,
      dealValue: numDeal ?? input.dealValue ?? undefined,
      dealValueFormatted: strDealFormatted,
      valor: numDeal ?? input.dealValue ?? undefined,
      value: numDeal ?? input.dealValue ?? undefined,
      pipeline: input.dealProduct ? {
        product: input.dealProduct,
        produto: input.dealProduct,
        title: input.dealProduct,
        titulo: input.dealProduct,
        name: input.dealProduct,
        value: numDeal ?? input.dealValue ?? undefined,
        valor: numDeal ?? input.dealValue ?? undefined,
        dealValue: numDeal ?? input.dealValue ?? undefined,
        valueFormatted: strDealFormatted,
        status: input.dealStatus || 'Enviar Cotação',
        etapa: input.dealStatus || 'Enviar Cotação',
        stage: input.dealStatus || 'Enviar Cotação',
      } : undefined,
      deal: input.dealProduct ? {
        product: input.dealProduct,
        produto: input.dealProduct,
        title: input.dealProduct,
        titulo: input.dealProduct,
        value: numDeal ?? input.dealValue ?? undefined,
        valor: numDeal ?? input.dealValue ?? undefined,
        dealValue: numDeal ?? input.dealValue ?? undefined,
        valueFormatted: strDealFormatted,
        status: input.dealStatus || 'Enviar Cotação',
        etapa: input.dealStatus || 'Enviar Cotação',
      } : undefined,
      opportunity: input.dealProduct ? {
        product: input.dealProduct,
        produto: input.dealProduct,
        title: input.dealProduct,
        titulo: input.dealProduct,
        value: numDeal ?? input.dealValue ?? undefined,
        valor: numDeal ?? input.dealValue ?? undefined,
        dealValue: numDeal ?? input.dealValue ?? undefined,
        valueFormatted: strDealFormatted,
        status: input.dealStatus || 'Enviar Cotação',
        etapa: input.dealStatus || 'Enviar Cotação',
      } : undefined,
      oportunidade: input.dealProduct ? {
        product: input.dealProduct,
        produto: input.dealProduct,
        title: input.dealProduct,
        titulo: input.dealProduct,
        value: numDeal ?? input.dealValue ?? undefined,
        valor: numDeal ?? input.dealValue ?? undefined,
        dealValue: numDeal ?? input.dealValue ?? undefined,
        valueFormatted: strDealFormatted,
        status: input.dealStatus || 'Enviar Cotação',
        etapa: input.dealStatus || 'Enviar Cotação',
      } : undefined,
      lead: input.dealProduct ? {
        product: input.dealProduct,
        produto: input.dealProduct,
        title: input.dealProduct,
        titulo: input.dealProduct,
        value: numDeal ?? input.dealValue ?? undefined,
        valor: numDeal ?? input.dealValue ?? undefined,
        dealValue: numDeal ?? input.dealValue ?? undefined,
        valueFormatted: strDealFormatted,
        status: input.dealStatus || 'Enviar Cotação',
        etapa: input.dealStatus || 'Enviar Cotação',
      } : undefined,

      notes: input.notes || undefined,
      observacoes: input.notes || undefined,
    };

    const res = await fetch(crmUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': env.crmApiKey,
      },
      body: JSON.stringify(payload),
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

export interface CreateOpportunityInput {
  phone: string;
  name?: string;
  dealProduct: string;
  dealValue?: string | number;
  dealStatus?: string;
  dealDate?: string;
  notes?: string;
  assignedToName?: string;
  assignedToEmail?: string;
  assignedToId?: string;
  responded?: boolean;
}

/**
 * Envia uma nova oportunidade/cotação diretamente para o módulo LEADS & Pipeline no CRM da Monteiro Seguros,
 * e salva de forma persistente no sistema Whats.
 * POST {CRM_BASE_URL}/api/v1/external/contacts
 * Header: X-API-Key: {{CRM_API_KEY}}
 */
export async function createOpportunityInCrm(input: CreateOpportunityInput): Promise<{ ok: boolean; data?: any; error?: string }> {
  const cleanPhone = normalizePhoneForCrm(input.phone);
  if (!cleanPhone) {
    return { ok: false, error: 'Telefone inválido para criar oportunidade' };
  }

  // Normalização do valor monetário (R$ 3.500,00 -> 3500.00 Float)
  const numDeal = parseCurrency(input.dealValue);
  const strDealFormatted = formatCurrency(numDeal) || (input.dealValue ? String(input.dealValue) : undefined);

  // Status/Etapa da oportunidade: se não especificada, assume 'Respondida'
  const statusVal = (input.dealStatus || 'Respondida').trim();

  // Consulta se o contato já existe para preservar dados cadastrais
  const existing = await lookupContactInCrm(cleanPhone).catch(() => ({ found: false } as CrmLookupResponse));
  const contactName = input.name || existing.contact?.name || 'Lead WhatsApp';

  // 1. GUARDA IMEDIATAMENTE NO SISTEMA WHATS (Persistência Local Confiável)
  try {
    addLocalCrmDeal(cleanPhone, {
      product: input.dealProduct,
      produto: input.dealProduct,
      title: input.dealProduct,
      value: numDeal,
      valueFormatted: strDealFormatted,
      status: statusVal,
      etapa: statusVal,
      notes: (input.notes || '') + (input.dealDate ? ` [Data Retorno: ${input.dealDate}]` : ''),
      dealDate: input.dealDate || undefined,
      assignedToName: input.assignedToName || undefined,
      assignedToEmail: input.assignedToEmail || undefined,
      assignedToId: input.assignedToId || undefined,
      responded: input.responded ?? true,
      createdAt: new Date().toISOString(),
    });
    if (contactName && (!existing.contact?.name || existing.contact.name === 'Lead WhatsApp')) {
      saveLocalCrmContact(cleanPhone, { name: contactName });
    }
  } catch (err: any) {
    logger.error('Erro ao salvar oportunidade no armazenamento local Whats:', err?.message);
  }

  // 2. PREPARA DADOS E ENVIA PARA A API DO CRM EXTERNO
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  const cleanWithCountry = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  try {
    logger.info(`Criando Oportunidade no CRM: phone=${cleanPhone}, produto=${input.dealProduct}, valor=${numDeal}, status=${statusVal}, responsavel=${input.assignedToName || 'Não informado'}`);

    const opportunityData = {
      product: input.dealProduct,
      produto: input.dealProduct,
      title: input.dealProduct,
      titulo: input.dealProduct,
      name: input.dealProduct,
      nome: input.dealProduct,
      value: numDeal ?? input.dealValue ?? undefined,
      valor: numDeal ?? input.dealValue ?? undefined,
      dealValue: numDeal ?? input.dealValue ?? undefined,
      valueFormatted: strDealFormatted,
      status: statusVal,
      etapa: statusVal,
      stage: statusVal,
      responded: true,
      respondida: true,
      date: input.dealDate || undefined,
      dealDate: input.dealDate || undefined,
      dataRetorno: input.dealDate || undefined,
      assignedTo: input.assignedToName ? {
        id: input.assignedToId || undefined,
        name: input.assignedToName,
        email: input.assignedToEmail || undefined,
      } : undefined,
      assignedToName: input.assignedToName || undefined,
      assignedToEmail: input.assignedToEmail || undefined,
      assignedToId: input.assignedToId || undefined,
      responsavel: input.assignedToName || undefined,
      responsavelEmail: input.assignedToEmail || undefined,
      consultor: input.assignedToName || undefined,
      notifyResponsible: true,
      dispararEmail: true,
      notificarPorEmail: true,
      notes: (input.notes || '') + (input.dealDate ? ` [Data Retorno: ${input.dealDate}]` : '') || undefined,
      observacoes: (input.notes || '') + (input.dealDate ? ` [Data Retorno: ${input.dealDate}]` : '') || undefined,
    };

    const payload = {
      name: contactName,
      nome: contactName,
      fullName: contactName,
      phone: cleanPhone,
      telefone: cleanPhone,
      whatsapp: cleanPhone,
      phoneWithCountry: cleanWithCountry,
      type: existing.contact?.type || 'PF',
      tipo: existing.contact?.type || 'PF',
      email: existing.contact?.email || undefined,
      document: existing.contact?.document || undefined,

      // Responsável
      assignedTo: opportunityData.assignedTo,
      assignedToName: input.assignedToName || undefined,
      assignedToEmail: input.assignedToEmail || undefined,
      assignedToId: input.assignedToId || undefined,
      responsavel: input.assignedToName || undefined,
      responsavelEmail: input.assignedToEmail || undefined,
      consultor: input.assignedToName || undefined,
      notifyResponsible: true,
      dispararEmail: true,
      notificarPorEmail: true,

      // Valores no root para compatibilidade máxima com qualquer leitor do CRM
      dealProduct: input.dealProduct,
      dealValue: numDeal ?? input.dealValue ?? undefined,
      dealValueFormatted: strDealFormatted,
      dealStatus: statusVal,
      value: numDeal ?? input.dealValue ?? undefined,
      valor: numDeal ?? input.dealValue ?? undefined,
      responded: true,
      respondida: true,

      // Pipeline e sinônimos para compatibilidade total com LEADS & Pipeline do CRM
      pipeline: opportunityData,
      deal: opportunityData,
      opportunity: opportunityData,
      oportunidade: opportunityData,
      lead: opportunityData,
      deals: [opportunityData],
      opportunities: [opportunityData],

      notes: input.notes || undefined,
      observacoes: input.notes || undefined,
    };

    // Rota 1: POST {CRM_BASE_URL}/api/v1/external/contacts
    const crmContactsUrl = `${env.crmBaseUrl}/api/v1/external/contacts`;
    let res = await fetch(crmContactsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': env.crmApiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // Se a rota contacts responder com status de não suportado ou erro de validação/duplicidade, tenta rota dedicada de deals
    if (!res.ok && (res.status === 404 || res.status === 405 || res.status === 409 || res.status === 422)) {
      const crmDealsUrl = `${env.crmBaseUrl}/api/v1/external/deals`;
      logger.info(`Tentando fallback para rota dedicada de deals no CRM: ${crmDealsUrl}`);
      try {
        const resDeals = await fetch(crmDealsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Key': env.crmApiKey,
          },
          body: JSON.stringify({
            phone: cleanPhone,
            whatsapp: cleanPhone,
            ...opportunityData,
          }),
          signal: controller.signal,
        });
        if (resDeals.ok) {
          const dataDeals = await resDeals.json().catch(() => ({}));
          return { ok: true, data: dataDeals };
        }
      } catch {
        // segue para reportar erro original da rota principal
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn(`API CRM criar oportunidade respondeu status ${res.status}: ${errText.slice(0, 200)}`);
      return { ok: false, error: `CRM respondeu erro (HTTP ${res.status}): ${errText.slice(0, 150) || 'Falha ao criar oportunidade'}` };
    }

    const data = (await res.json()) as any;
    return { ok: true, data };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: 'Timeout de 10s ao conectar com o CRM' };
    }
    logger.error(`Erro ao criar oportunidade no CRM (${cleanPhone}):`, err?.message || err);
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

/**
 * Consulta lista de funcionários/consultores do CRM para atribuição como responsáveis.
 * Tenta endpoints do CRM externo e complementa com atendentes ativos do WhatsApp Central como fallback.
 */
export async function getCrmUsers(): Promise<CrmUserItem[]> {
  const usersMap = new Map<string, CrmUserItem>();

  // 1. Tenta consultar a API do CRM externo
  const endpoints = [
    `${env.crmBaseUrl}/api/v1/external/users`,
    `${env.crmBaseUrl}/api/v1/external/employees`,
    `${env.crmBaseUrl}/api/v1/users`,
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4_000);
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-API-Key': env.crmApiKey,
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const json = await res.json() as any;
        const list = Array.isArray(json)
          ? json
          : Array.isArray(json?.users)
          ? json.users
          : Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.employees)
          ? json.employees
          : [];

        if (list.length > 0) {
          for (const u of list) {
            const name = (u.name || u.nome || u.username || u.fullName || '').trim();
            const id = String(u.id || u._id || name || Math.random());
            const email = (u.email || u.mail || '').trim() || undefined;
            const role = (u.role || u.funcao || u.cargo || '').trim() || undefined;
            if (name) {
              usersMap.set(name.toLowerCase(), { id, name, email, role });
            }
          }
          if (usersMap.size > 0) {
            logger.info(`Carregados ${usersMap.size} funcionários do CRM via ${url}`);
            break;
          }
        }
      }
    } catch {
      // continua para o próximo ou fallback
    }
  }

  // 2. Fallback / Mescla com atendentes do sistema local
  try {
    const localUsers = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, username: true, email: true, role: true },
    });
    for (const u of localUsers) {
      const name = u.username.trim();
      const key = name.toLowerCase();
      if (!usersMap.has(key)) {
        usersMap.set(key, {
          id: u.id,
          name,
          email: u.email || undefined,
          role: u.role || 'attendant',
        });
      }
    }
  } catch (err: any) {
    logger.warn('Falha ao obter atendentes locais para lista de responsáveis:', err?.message);
  }

  return Array.from(usersMap.values());
}

