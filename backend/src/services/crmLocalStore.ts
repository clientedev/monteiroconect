import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface LocalCrmDeal {
  id?: string;
  product: string;
  produto?: string;
  title?: string;
  value?: number;
  valueFormatted?: string;
  status?: string;
  etapa?: string;
  date?: string;
  notes?: string;
  createdAt: string;
}

export interface LocalCrmContactRecord {
  phone: string;
  name?: string;
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

  // Produtos
  product?: string;
  produto?: string;
  produtos?: string[];

  // Apólice
  insurance?: {
    product?: string;
    insurer?: string;
    policyNumber?: string;
    premiumValue?: number;
    premiumValueFormatted?: string;
    expirationDate?: string;
  };

  // Pipeline / Negócios
  deals: LocalCrmDeal[];
  updatedAt: string;
}

const CACHE_FILE = path.resolve(process.cwd(), 'sessions', 'crm_contacts_cache.json');

let store: Record<string, LocalCrmContactRecord> = {};

// Carrega o cache do disco na inicialização
try {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    store = JSON.parse(raw);
  }
} catch (err: any) {
  logger.warn('Falha ao ler cache local de contatos do CRM, iniciando vazio:', err?.message);
  store = {};
}

function saveStoreToDisk() {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err: any) {
    logger.error('Erro ao salvar cache de contatos CRM no disco:', err?.message);
  }
}

export function getLocalCrmContact(cleanPhone: string): LocalCrmContactRecord | undefined {
  if (!cleanPhone) return undefined;
  return store[cleanPhone];
}

export function saveLocalCrmContact(cleanPhone: string, data: Partial<LocalCrmContactRecord>) {
  if (!cleanPhone) return;
  const existing = store[cleanPhone] || { phone: cleanPhone, deals: [], updatedAt: new Date().toISOString() };

  // Atualiza dados cadastrais
  store[cleanPhone] = {
    ...existing,
    ...data,
    phone: cleanPhone,
    insurance: data.insurance !== undefined ? {
      ...(existing.insurance || {}),
      ...data.insurance,
    } : existing.insurance,
    deals: data.deals !== undefined ? data.deals : existing.deals,
    updatedAt: new Date().toISOString(),
  };

  saveStoreToDisk();
}

export function addLocalCrmDeal(cleanPhone: string, deal: LocalCrmDeal) {
  if (!cleanPhone) return;
  const existing = store[cleanPhone] || { phone: cleanPhone, deals: [], updatedAt: new Date().toISOString() };

  // Evita duplicatas idênticas adicionadas em sequência
  const filtered = existing.deals.filter(
    d => !(d.product === deal.product && d.status === deal.status && d.value === deal.value)
  );

  filtered.unshift(deal);
  existing.deals = filtered;
  existing.updatedAt = new Date().toISOString();
  store[cleanPhone] = existing;

  saveStoreToDisk();
}
