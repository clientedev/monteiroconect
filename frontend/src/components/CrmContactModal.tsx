import { useState, useEffect, useMemo } from 'react';
import { contactApi } from '../lib/api';
import {
  X,
  User,
  Shield,
  DollarSign,
  Calendar,
  Mail,
  FileText,
  UserCheck,
  UserX,
  MessageSquare,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Phone,
  UserPlus,
  MapPin,
  Building,
  Briefcase,
  FileEdit,
  Tag,
  Layers,
  PlusCircle,
  TrendingUp,
  Send,
} from 'lucide-react';

interface CrmContactModalProps {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    conversationId?: string | null;
    initialTab?: 'details' | 'opportunities' | 'create';
  } | null;
  onClose: () => void;
  onOpenConversation?: (contact: any) => void;
}

const INSURER_OPTIONS = [
  'Porto Seguro',
  'Bradesco Seguros',
  'SulAmérica',
  'Amil',
  'Omint',
  'Azos',
  'Tokio Marine',
  'Allianz',
  'HDI Seguros',
  'Mapfre',
  'Liberty Seguros',
  'Sompo Seguros',
  'Zurich',
  'Outra',
];

const PRODUCT_OPTIONS = [
  'Auto',
  'Consórcio',
  'Empresarial',
  'Fiança Locatícia',
  'Odonto',
  'Pet',
  'Previdência',
  'Residencial',
  'Responsabilidade Civil',
  'Saúde',
  'Viagem',
  'Vida',
  'Outro',
];

const PIPELINE_STAGE_OPTIONS = [
  'Respondida',
  'Enviar Cotação',
  'Revisão Agendada',
  'Aguardando Retorno do Cliente',
  'Em Implantação',
  'Implantado',
  'Venda Perdida',
  'Apólice Cancelada',
];

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

function formatDateForInput(val: any): string {
  if (!val) return '';
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    return trimmed.split('T')[0];
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/');
    return `${y}-${m}-${d}`;
  }
  return '';
}

export default function CrmContactModal({
  contact,
  onClose,
  onOpenConversation,
}: CrmContactModalProps) {
  const [loading, setLoading] = useState(true);
  const [crmData, setCrmData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Aba ativa: 'details' (Visualizar), 'opportunities' (Oportunidades) ou 'create' (Cadastrar/Editar)
  const [activeTab, setActiveTab] = useState<'details' | 'opportunities' | 'create'>(contact?.initialTab || 'details');

  useEffect(() => {
    if (contact?.initialTab) {
      setActiveTab(contact.initialTab);
    }
  }, [contact?.initialTab]);

  // Lista de Funcionários/Consultores do CRM para responsáveis
  const [crmUsers, setCrmUsers] = useState<Array<{ id: string; name: string; email?: string; role?: string }>>([]);
  const [loadingCrmUsers, setLoadingCrmUsers] = useState(false);

  useEffect(() => {
    setLoadingCrmUsers(true);
    contactApi.crmListUsers()
      .then((users) => setCrmUsers(users || []))
      .catch(() => setCrmUsers([]))
      .finally(() => setLoadingCrmUsers(false));
  }, []);

  // 1. Dados Pessoais / Cadastrais
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formSecondaryPhone, setFormSecondaryPhone] = useState('');
  const [formType, setFormType] = useState('PF');
  const [formDocument, setFormDocument] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAnniversaryDate, setFormAnniversaryDate] = useState('');
  const [formStatus, setFormStatus] = useState('Ativo');
  const [formAssignedToName, setFormAssignedToName] = useState('');

  // 2. Endereço Completo
  const [formZipCode, setFormZipCode] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formComplement, setFormComplement] = useState('');
  const [formNeighborhood, setFormNeighborhood] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formState, setFormState] = useState('');

  // 3. Apólice / Seguro Inicial
  const [formProduct, setFormProduct] = useState('');
  const [formInsurer, setFormInsurer] = useState('');
  const [formPolicyNumber, setFormPolicyNumber] = useState('');
  const [formPremiumValue, setFormPremiumValue] = useState('');
  const [formExpirationDate, setFormExpirationDate] = useState('');

  // 4. Negócio no Funil de Vendas
  const [formDealProduct, setFormDealProduct] = useState('');
  const [formDealValue, setFormDealValue] = useState('');
  const [formDealStatus, setFormDealStatus] = useState('Respondida');
  const [formNotes, setFormNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Modal / Drawer de Criar Oportunidade no LEADS & Pipeline
  const [showOpportunityModal, setShowOpportunityModal] = useState(false);
  const [oppProduct, setOppProduct] = useState('');
  const [oppValue, setOppValue] = useState('');
  const [oppStatus, setOppStatus] = useState('Respondida');
  const [oppAssignedToName, setOppAssignedToName] = useState('');
  const [oppAssignedToEmail, setOppAssignedToEmail] = useState('');
  const [oppAssignedToId, setOppAssignedToId] = useState('');
  const [oppDate, setOppDate] = useState('');
  const [oppNotes, setOppNotes] = useState('');
  const [oppSubmitting, setOppSubmitting] = useState(false);
  const [oppError, setOppError] = useState<string | null>(null);
  const [oppSuccess, setOppSuccess] = useState<string | null>(null);

  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oppProduct.trim()) {
      setOppError('Por favor, selecione ou informe o produto da oportunidade.');
      return;
    }
    setOppSubmitting(true);
    setOppError(null);
    setOppSuccess(null);

    try {
      const res = await contactApi.crmCreateOpportunity({
        phone: formPhone || contact?.phone || '',
        name: formName || contact?.name || undefined,
        dealProduct: oppProduct.trim(),
        dealValue: oppValue.trim() || undefined,
        dealStatus: oppStatus || 'Respondida',
        dealDate: oppDate.trim() || undefined,
        assignedToName: oppAssignedToName.trim() || undefined,
        assignedToEmail: oppAssignedToEmail.trim() || undefined,
        assignedToId: oppAssignedToId.trim() || undefined,
        responded: true,
        notes: (oppNotes.trim() + (oppDate ? ` [Data de Agendamento: ${oppDate}]` : '')).trim() || undefined,
      });

      if (res.ok) {
        setOppSuccess('Oportunidade registrada com sucesso como Respondida no CRM! Notificação de e-mail disparada ao responsável.');
        setTimeout(() => {
          if (contact) {
            fetchCrmData(contact.phone, contact.id);
          }
          setShowOpportunityModal(false);
          setOppProduct('');
          setOppValue('');
          setOppStatus('Respondida');
          setOppDate('');
          setOppNotes('');
          setOppSuccess(null);
        }, 1200);
      } else {
        setOppError(res.error || 'Não foi possível criar a oportunidade no CRM.');
      }
    } catch (err: any) {
      setOppError(err?.message || 'Falha ao conectar com o servidor do CRM.');
    } finally {
      setOppSubmitting(false);
    }
  };

  const populateFormFromCrmData = (data: any, currentContact: any) => {
    if (!data) return;
    const raw = data?.raw || {};
    const crmC = data?.contact || {};
    const firstPolicy = Array.isArray(data?.insurance?.policies) && data.insurance.policies.length > 0 ? data.insurance.policies[0] : {};
    const firstDeal = Array.isArray(data?.pipeline?.deals) && data.pipeline.deals.length > 0 ? data.pipeline.deals[0] : {};

    setFormName(crmC.name || raw.name || raw.nome || currentContact?.name || '');
    setFormPhone(crmC.phone || raw.phone || raw.telefone || currentContact?.phone || '');
    setFormSecondaryPhone(
      crmC.secondaryPhone || crmC.telefoneSecundario || raw.secondaryPhone || raw.telefoneSecundario || raw.phone2 || ''
    );
    setFormType(crmC.type || crmC.tipo || raw.type || raw.tipo || 'PF');
    setFormDocument(
      crmC.document || crmC.cpf || crmC.cnpj || crmC.cpfCnpj || raw.document || raw.cpf || raw.cnpj || raw.cpfCnpj || ''
    );
    setFormEmail(crmC.email || raw.email || '');
    setFormAnniversaryDate(
      formatDateForInput(
        crmC.anniversaryDate || crmC.birthDate || crmC.dataNascimento || raw.anniversaryDate || raw.birthDate || raw.dataNascimento || ''
      )
    );
    setFormStatus(crmC.status || raw.status || 'Ativo');
    setFormAssignedToName(
      crmC.assignedTo?.name || crmC.assignedToName || crmC.consultor || raw.assignedToName || raw.consultor || ''
    );

    // Endereço
    const addr = raw.address && typeof raw.address === 'object' ? raw.address : {};
    setFormZipCode(crmC.zipCode || crmC.cep || raw.zipCode || raw.cep || addr.zipCode || addr.cep || '');
    setFormAddress(crmC.address || crmC.rua || crmC.logradouro || raw.address || raw.rua || raw.logradouro || addr.street || addr.logradouro || '');
    setFormNumber(crmC.number || crmC.numero || raw.number || raw.numero || addr.number || addr.numero || '');
    setFormComplement(crmC.complement || crmC.complemento || raw.complement || raw.complemento || addr.complement || addr.complemento || '');
    setFormNeighborhood(crmC.neighborhood || crmC.bairro || raw.neighborhood || raw.bairro || addr.neighborhood || addr.bairro || '');
    setFormCity(crmC.city || crmC.cidade || raw.city || raw.cidade || addr.city || addr.cidade || '');
    setFormState(crmC.state || crmC.uf || crmC.estado || raw.state || raw.uf || addr.state || addr.uf || '');

    // Apólice / Seguro
    const incomingProduct = (data?.products && data.products.length > 0 ? data.products[0] : null) ||
      crmC.produtos ||
      crmC.produto ||
      crmC.product ||
      raw.produtos ||
      raw.produto ||
      raw.product ||
      firstPolicy.product ||
      firstPolicy.produto ||
      '';
    if (incomingProduct) setFormProduct(incomingProduct);

    const incomingInsurer = firstPolicy.insurer || firstPolicy.seguradora || raw.insurer || raw.seguradora || '';
    if (incomingInsurer) setFormInsurer(incomingInsurer);

    const incomingPolicyNumber = firstPolicy.policyNumber || firstPolicy.apolice || firstPolicy.numeroApolice || raw.policyNumber || raw.apolice || '';
    if (incomingPolicyNumber) setFormPolicyNumber(incomingPolicyNumber);

    const incomingPremiumValue = firstPolicy.premiumValueFormatted || (firstPolicy.premiumValue ? String(firstPolicy.premiumValue) : '') || firstPolicy.premio || firstPolicy.valor || raw.premiumValueFormatted || raw.premiumValue || raw.premio || '';
    if (incomingPremiumValue) setFormPremiumValue(incomingPremiumValue);

    const incomingExpirationDate = formatDateForInput(
      firstPolicy.expirationDate || firstPolicy.vencimento || raw.expirationDate || raw.vencimento || ''
    );
    if (incomingExpirationDate) setFormExpirationDate(incomingExpirationDate);

    // Funil de Vendas (LEADS & Pipeline)
    const incomingDealProduct = firstDeal.product || firstDeal.produto || firstDeal.title || firstDeal.titulo || raw.dealProduct || '';
    if (incomingDealProduct) setFormDealProduct(incomingDealProduct);

    const incomingDealValue = firstDeal.valueFormatted || (firstDeal.value ? String(firstDeal.value) : '') || raw.dealValueFormatted || raw.dealValue || raw.valorNegocio || raw.valor || '';
    if (incomingDealValue) setFormDealValue(incomingDealValue);

    const incomingDealStatus = firstDeal.status || firstDeal.etapa || raw.dealStatus || '';
    if (incomingDealStatus) setFormDealStatus(incomingDealStatus);

    // Observações
    const incomingNotes = crmC.notes || crmC.observacoes || raw.notes || raw.observacoes || '';
    if (incomingNotes) setFormNotes(incomingNotes);
  };

  const fetchCrmData = (phone: string, id: string) => {
    setLoading(true);
    setError(null);

    contactApi
      .crmLookup(phone)
      .then((data) => {
        setCrmData(data);
        populateFormFromCrmData(data, contact);
        if (contact?.initialTab) {
          setActiveTab(contact.initialTab);
        } else if (data && data.found === true) {
          setActiveTab('details');
        } else {
          setActiveTab('create');
        }
      })
      .catch((err) => {
        contactApi
          .crmLookupById(id)
          .then((data) => {
            setCrmData(data);
            populateFormFromCrmData(data, contact);
            if (contact?.initialTab) {
              setActiveTab(contact.initialTab);
            } else if (data && data.found === true) {
              setActiveTab('details');
            } else {
              setActiveTab('create');
            }
          })
          .catch(() => {
            setError(err?.message || 'Contato não localizado no CRM');
            if (contact?.initialTab) {
              setActiveTab(contact.initialTab);
            } else {
              setActiveTab('create');
            }
          });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!contact) return;
    setCrmData(null);
    setFormName(contact.name || '');
    setFormPhone(contact.phone || '');
    setFormSecondaryPhone('');
    setFormType('PF');
    setFormDocument('');
    setFormEmail('');
    setFormAnniversaryDate('');
    setFormStatus('Ativo');
    setFormAssignedToName('');

    setFormZipCode('');
    setFormAddress('');
    setFormNumber('');
    setFormComplement('');
    setFormNeighborhood('');
    setFormCity('');
    setFormState('');

    setFormProduct('');
    setFormInsurer('');
    setFormPolicyNumber('');
    setFormPremiumValue('');
    setFormExpirationDate('');

    setFormDealProduct('');
    setFormDealValue('');
    setFormDealStatus('Enviar Cotação');
    setFormNotes('');

    setFormError(null);
    setFormSuccess(null);
    setActiveTab('details');

    fetchCrmData(contact.phone, contact.id);
  }, [contact]);

  const handleCreateCrmContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      setFormError('Por favor, informe o nome e telefone do contato.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const res = await contactApi.crmCreate({
        name: formName.trim(),
        phone: formPhone.trim(),
        secondaryPhone: formSecondaryPhone.trim() || undefined,
        type: formType,
        document: formDocument.trim() || undefined,
        email: formEmail.trim() || undefined,
        anniversaryDate: formAnniversaryDate.trim() || undefined,
        status: formStatus,
        assignedToName: formAssignedToName.trim() || undefined,

        zipCode: formZipCode.trim() || undefined,
        address: formAddress.trim() || undefined,
        number: formNumber.trim() || undefined,
        complement: formComplement.trim() || undefined,
        neighborhood: formNeighborhood.trim() || undefined,
        city: formCity.trim() || undefined,
        state: formState.trim() || undefined,

        product: formProduct.trim() || undefined,
        produto: formProduct.trim() || undefined,
        produtos: formProduct.trim() || undefined,
        insurer: formInsurer.trim() || undefined,
        policyNumber: formPolicyNumber.trim() || undefined,
        premiumValue: formPremiumValue.trim() || undefined,
        expirationDate: formExpirationDate.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });

      if (res.ok) {
        setFormSuccess('Contato cadastrado com sucesso com todas as informações no CRM!');
        setTimeout(() => {
          if (contact) {
            fetchCrmData(contact.phone, contact.id);
          }
        }, 1200);
      } else {
        setFormError(res.error || 'Não foi possível cadastrar o contato no CRM.');
      }
    } catch (err: any) {
      setFormError(err?.message || 'Falha ao conectar com o servidor do CRM.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!contact) return null;

  const found = crmData?.found === true;
  const crmContact = crmData?.contact;
  const insurance = crmData?.insurance;
  const pipeline = crmData?.pipeline;

  const dealsToDisplay = useMemo(() => {
    const rawDeals = Array.isArray(pipeline?.deals) ? pipeline.deals : [];
    const seen = new Set<string>();
    return rawDeals.filter((d: any) => {
      const prod = (d.product || d.produto || d.title || 'Oportunidade').trim().toLowerCase();
      const stg = (d.status || d.etapa || d.stage || '').trim().toLowerCase();
      const key = `${prod}_${stg}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [pipeline?.deals]);

  const totalDealsValue = useMemo(() => {
    let total = 0;
    for (const d of dealsToDisplay) {
      if (typeof d.value === 'number' && !isNaN(d.value)) {
        total += d.value;
      }
    }
    return total > 0 ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total) : null;
  }, [dealsToDisplay]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-monte-sereno/20">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-monte-azul to-monte-verde text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold text-lg text-white">
              {(contact.name || contact.phone || '?')[0].toUpperCase()}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">
                {contact.name || 'Contato WhatsApp'}
              </h3>
              <p className="text-xs text-white/80 flex items-center gap-1">
                <Phone className="w-3 h-3" /> {contact.phone}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 bg-monte-areiaSecao/40 border-b border-monte-sereno/15 flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'details'
                ? 'border-monte-verde text-monte-verde bg-white shadow-2xs'
                : 'border-transparent text-monte-sereno hover:text-monte-azul'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Consulta & Produtos no CRM</span>
            {found ? (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('opportunities')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'opportunities'
                ? 'border-amber-500 text-amber-800 bg-white shadow-2xs'
                : 'border-transparent text-monte-sereno hover:text-monte-azul'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-amber-600" />
            <span>Oportunidades & Funil</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              dealsToDisplay.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
            }`}>
              {dealsToDisplay.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
              activeTab === 'create'
                ? 'border-monte-verde text-monte-verde bg-white shadow-2xs'
                : 'border-transparent text-monte-sereno hover:text-monte-azul'
            }`}
          >
            <FileEdit className="w-4 h-4" />
            <span>{found ? '✏️ Editar / Atualizar Cadastro no CRM' : '➕ Cadastrar Completo no CRM'}</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-10 h-10 animate-spin text-monte-verde mx-auto" />
              <p className="text-sm font-medium text-monte-azul">
                Consultando dados no CRM da Monteiro Seguros...
              </p>
              <p className="text-xs text-monte-sereno">
                Verificando cadastro, apólices e oportunidades no funil.
              </p>
            </div>
          ) : activeTab === 'details' ? (
            found ? (
              <>
                {/* Badge de Status Cadastrado */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-semibold">Cliente Cadastrado no CRM</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {crmContact?.status && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                        {crmContact.status}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setOppProduct(formProduct || 'Auto');
                        setOppValue('');
                        setOppStatus('Enviar Cotação');
                        setOppNotes('');
                        setOppError(null);
                        setOppSuccess(null);
                        setShowOpportunityModal(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-monte-azul to-monte-verde text-white hover:opacity-95 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Criar Oportunidade
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('create')}
                      className="px-3 py-1.5 rounded-xl bg-monte-verde text-white hover:bg-emerald-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <FileEdit className="w-3.5 h-3.5" /> Editar Cadastro
                    </button>
                  </div>
                </div>

                {/* 🏷️ Produtos no Cadastro (Etiquetas CRM) */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-monte-azul flex items-center gap-2 border-b border-monte-sereno/10 pb-2">
                    <Tag className="w-4 h-4 text-monte-verde" /> 🏷️ Produtos no Cadastro (CRM)
                  </h4>
                  {crmData?.products && crmData.products.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {crmData.products.map((prod: string, idx: number) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
                        >
                          <Shield className="w-3.5 h-3.5 text-emerald-600" />
                          {prod}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-monte-sereno italic p-3 bg-monte-areiaSecao/30 rounded-xl">
                      Nenhum produto cadastrado no CRM.
                    </p>
                  )}
                </div>

                {/* 👤 Dados Cadastrais */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-monte-azul flex items-center gap-2 border-b border-monte-sereno/10 pb-2">
                    <User className="w-4 h-4 text-monte-verde" /> 👤 Dados Pessoais / Cadastrais
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                    <div className="p-3 bg-monte-areiaSecao/40 rounded-xl">
                      <span className="text-xs text-monte-sereno block">Nome Completo</span>
                      <span className="font-semibold text-monte-azul">{crmContact?.name || '-'}</span>
                    </div>
                    <div className="p-3 bg-monte-areiaSecao/40 rounded-xl">
                      <span className="text-xs text-monte-sereno block">Tipo de Pessoa</span>
                      <span className="font-semibold text-monte-azul">{crmContact?.type || 'PF'}</span>
                    </div>
                    <div className="p-3 bg-monte-areiaSecao/40 rounded-xl">
                      <span className="text-xs text-monte-sereno block flex items-center gap-1">
                        <Mail className="w-3 h-3" /> E-mail
                      </span>
                      <span className="font-medium text-monte-azul truncate block">
                        {crmContact?.email || 'Não informado'}
                      </span>
                    </div>
                    <div className="p-3 bg-monte-areiaSecao/40 rounded-xl">
                      <span className="text-xs text-monte-sereno block flex items-center gap-1">
                        <FileText className="w-3 h-3" /> CPF / CNPJ
                      </span>
                      <span className="font-medium text-monte-azul">
                        {crmContact?.document || 'Não informado'}
                      </span>
                    </div>
                    <div className="p-3 bg-monte-areiaSecao/40 rounded-xl">
                      <span className="text-xs text-monte-sereno block flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Data de Aniversário
                      </span>
                      <span className="font-medium text-monte-azul">
                        {crmContact?.anniversaryDate || 'Não informada'}
                      </span>
                    </div>
                    <div className="p-3 bg-monte-areiaSecao/40 rounded-xl">
                      <span className="text-xs text-monte-sereno block flex items-center gap-1">
                        <UserCheck className="w-3 h-3" /> Consultor Responsável
                      </span>
                      <span className="font-medium text-monte-azul">
                        {crmContact?.assignedTo?.name || 'Não atribuído'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 🛡️ Apólices de Seguro Ativas */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-monte-sereno/10 pb-2">
                    <h4 className="text-sm font-bold text-monte-azul flex items-center gap-2">
                      <Shield className="w-4 h-4 text-monte-verde" /> 🛡️ Apólices de Seguro Ativas
                    </h4>
                    <div className="text-xs font-semibold px-2.5 py-0.5 bg-monte-verde/10 text-monte-verde rounded-full">
                      {insurance?.activePoliciesCount || 0} ativas
                    </div>
                  </div>

                  {insurance?.totalAnnualPremiumFormatted && (
                    <p className="text-xs text-monte-sereno">
                      Prêmios Acumulados: <strong className="text-monte-azul">{insurance.totalAnnualPremiumFormatted}</strong>
                    </p>
                  )}

                  {!insurance?.policies || insurance.policies.length === 0 ? (
                    <p className="text-xs text-monte-sereno italic p-3 bg-monte-areiaSecao/30 rounded-xl">
                      Nenhuma apólice ativa encontrada no momento.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {insurance.policies.map((p: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-3 bg-monte-areiaSecao/50 rounded-xl border border-monte-sereno/10 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <p className="font-bold text-monte-azul text-sm">
                              {p.product || p.produto || 'Seguro'}
                            </p>
                            <p className="text-monte-sereno mt-0.5">
                              Seguradora: <span className="font-medium text-monte-azul">{p.insurer || p.seguradora || '-'}</span>
                            </p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-monte-sereno">
                              Apólice Nº: <span className="font-mono text-monte-azul">{p.policyNumber || p.apolice || '-'}</span>
                            </p>
                            {p.expirationDate || p.vencimento ? (
                              <p className="text-monte-sereno">
                                Vencimento: <span className="font-medium text-monte-azul">{p.expirationDate || p.vencimento}</span>
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 💰 Negociações no Funil */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-monte-sereno/10 pb-2">
                    <h4 className="text-sm font-bold text-monte-azul flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-monte-verde" /> 💰 Negociações no Funil (LEADS & Pipeline)
                    </h4>
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-semibold px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                        {dealsToDisplay.length} oportunidades
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setOppProduct(formProduct || 'Auto');
                          setOppValue('');
                          setOppStatus('Enviar Cotação');
                          setOppNotes('');
                          setOppError(null);
                          setOppSuccess(null);
                          setShowOpportunityModal(true);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-monte-verde text-white hover:bg-emerald-700 text-xs font-bold transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Criar Oportunidade
                      </button>
                    </div>
                  </div>

                  {dealsToDisplay.length === 0 ? (
                    <div className="p-4 bg-monte-areiaSecao/30 rounded-2xl border border-dashed border-monte-sereno/20 text-center space-y-2">
                      <p className="text-xs text-monte-sereno italic">
                        Nenhuma oportunidade ativa no funil.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setOppProduct(formProduct || 'Auto');
                          setOppValue('');
                          setOppStatus('Enviar Cotação');
                          setOppNotes('');
                          setOppError(null);
                          setOppSuccess(null);
                          setShowOpportunityModal(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-monte-verde text-white hover:bg-emerald-700 text-xs font-bold transition-all shadow-xs cursor-pointer"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Criar Oportunidade no Funil
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dealsToDisplay.map((d: any, idx: number) => {
                        const isResponded = (d.status || d.etapa || '').toLowerCase().includes('respond') || d.responded;
                        return (
                          <div
                            key={d.id || `${d.product}-${idx}`}
                            className="p-3.5 bg-monte-areiaSecao/50 rounded-2xl border border-monte-sereno/15 text-xs space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-monte-azul text-sm flex items-center gap-1.5">
                                  <Briefcase className="w-4 h-4 text-monte-verde" />
                                  {d.product || d.produto || d.title || 'Oportunidade'}
                                </span>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                  isResponded
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-monte-azul/10 text-monte-azul'
                                }`}>
                                  {isResponded && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                  {d.status || d.etapa || d.stage || 'Respondida'}
                                </span>
                              </div>
                              <div className="text-right font-bold text-monte-verde text-sm">
                                {d.valueFormatted || (d.value ? `R$ ${d.value}` : '-')}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between text-[11px] text-monte-sereno pt-1.5 border-t border-monte-sereno/10 gap-2">
                              <span className="flex items-center gap-1 text-slate-700">
                                <UserCheck className="w-3.5 h-3.5 text-monte-verde" />
                                Responsável: <strong className="text-monte-azul">{d.assignedToName || d.responsavel || d.assignedTo?.name || 'Não atribuído'}</strong>
                                {d.assignedToEmail && <span className="text-slate-400 font-mono text-[10px]">({d.assignedToEmail})</span>}
                              </span>
                              {(d.dealDate || d.date) && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3.5 h-3.5 text-monte-sereno" /> Retorno: <strong className="text-monte-azul">{d.dealDate || d.date}</strong>
                                </span>
                              )}
                            </div>
                            {d.notes && (
                              <p className="text-[11px] text-slate-600 italic bg-white/70 p-2 rounded-lg border border-monte-sereno/10">
                                {d.notes}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* Informação de Contato Não Encontrado com Botão de Cadastro */
              <div className="py-6 space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                  <UserX className="w-8 h-8" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-monte-azul">Contato não encontrado no CRM</h4>
                  <p className="text-sm text-monte-sereno max-w-md mx-auto mt-1">
                    O número <strong className="text-monte-azul">{crmData?.query?.phone || contact.phone}</strong> ainda não consta na base do CRM da Monteiro Seguros.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-monte-areiaSecao/60 border border-monte-sereno/15 max-w-md mx-auto text-left space-y-3">
                  <p className="text-xs font-semibold text-monte-azul flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-monte-verde" /> Deseja cadastrar este cliente agora?
                  </p>
                  <p className="text-xs text-monte-sereno">
                    Cadastre o cliente preenchendo todos os dados cadastrais, endereço, apólice inicial e oportunidade no funil de vendas.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="w-full py-2.5 px-4 bg-gradient-to-r from-monte-verde to-monte-azul text-white font-bold text-xs rounded-xl shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" /> Preencher Formulário Completo de Cadastro no CRM
                  </button>
                </div>
              </div>
            )
          ) : activeTab === 'opportunities' ? (
            /* Tab: Visão Completa de Oportunidades & Funil de Vendas */
            <div className="space-y-6">
              {/* Header de Resumo com Métricas e Botão de Ação */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 via-emerald-50 to-monte-areiaSecao/50 border border-amber-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-700 flex items-center justify-center font-bold">
                    <TrendingUp className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-monte-azul text-base">
                      Oportunidades & Funil de Vendas
                    </h4>
                    <p className="text-xs text-monte-sereno">
                      Negociações registradas para o contato <strong className="text-monte-azul">{formName || contact.name || contact.phone}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setOppProduct(formProduct || 'Auto');
                    setOppValue('');
                    setOppStatus('Respondida');
                    setOppAssignedToName(crmContact?.assignedTo?.name || formAssignedToName || (crmUsers[0]?.name || ''));
                    setOppAssignedToEmail(crmUsers.find(u => u.name === (crmContact?.assignedTo?.name || formAssignedToName))?.email || crmUsers[0]?.email || '');
                    setOppDate('');
                    setOppNotes('');
                    setOppError(null);
                    setOppSuccess(null);
                    setShowOpportunityModal(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-monte-verde to-emerald-700 text-white font-bold text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
                >
                  <PlusCircle className="w-4 h-4" /> Nova Oportunidade
                </button>
              </div>

              {/* Cards de Métricas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-white border border-monte-sereno/15 shadow-2xs">
                  <span className="text-[11px] font-semibold text-monte-sereno block mb-1">Oportunidades no CRM</span>
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-black text-monte-azul">{dealsToDisplay.length}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold">No Funil</span>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-white border border-monte-sereno/15 shadow-2xs">
                  <span className="text-[11px] font-semibold text-monte-sereno block mb-1">Valor Total Negociado</span>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-monte-verde">{totalDealsValue || 'R$ 0,00'}</span>
                    <DollarSign className="w-4 h-4 text-monte-verde" />
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-white border border-monte-sereno/15 shadow-2xs">
                  <span className="text-[11px] font-semibold text-monte-sereno block mb-1">Responsável no CRM</span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-monte-azul truncate">
                      {crmContact?.assignedTo?.name || formAssignedToName || 'Não atribuído'}
                    </span>
                    <UserCheck className="w-4 h-4 text-monte-verde shrink-0" />
                  </div>
                </div>
              </div>

              {/* Lista de Oportunidades */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-monte-sereno/15 pb-2">
                  <h5 className="font-bold text-xs uppercase tracking-wider text-monte-azul flex items-center gap-2">
                    <Layers className="w-4 h-4 text-monte-verde" /> Oportunidades do Contato ({dealsToDisplay.length})
                  </h5>
                </div>

                {dealsToDisplay.length === 0 ? (
                  <div className="p-8 bg-monte-areiaSecao/30 rounded-3xl border border-dashed border-monte-sereno/25 text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                      <h5 className="text-sm font-bold text-monte-azul">Nenhuma oportunidade ativa no funil</h5>
                      <p className="text-xs text-monte-sereno max-w-sm mx-auto mt-1">
                        Cadastre uma nova oportunidade informando o produto, valor estimado, responsável e agendamento.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOppProduct(formProduct || 'Auto');
                        setOppValue('');
                        setOppStatus('Respondida');
                        setOppAssignedToName(crmContact?.assignedTo?.name || formAssignedToName || (crmUsers[0]?.name || ''));
                        setOppAssignedToEmail(crmUsers.find(u => u.name === (crmContact?.assignedTo?.name || formAssignedToName))?.email || crmUsers[0]?.email || '');
                        setOppDate('');
                        setOppNotes('');
                        setOppError(null);
                        setOppSuccess(null);
                        setShowOpportunityModal(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-monte-verde text-white font-bold text-xs hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" /> Criar Primeira Oportunidade
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {dealsToDisplay.map((d: any, idx: number) => {
                      const isResponded = (d.status || d.etapa || '').toLowerCase().includes('respond') || d.responded;
                      return (
                        <div
                          key={d.id || `${d.product}-${idx}`}
                          className="p-4 bg-white rounded-2xl border border-monte-sereno/15 hover:border-monte-verde/40 shadow-xs transition-all space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-monte-verde/10 text-monte-verde flex items-center justify-center font-bold">
                                <Briefcase className="w-4.5 h-4.5" />
                              </div>
                              <div>
                                <h6 className="font-bold text-sm text-monte-azul leading-snug">
                                  {d.product || d.produto || d.title || 'Oportunidade'}
                                </h6>
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${
                                  isResponded
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {isResponded && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                  {d.status || d.etapa || d.stage || 'Respondida'}
                                </span>
                              </div>
                            </div>
                            <div className="text-left sm:text-right">
                              <span className="text-[10px] text-monte-sereno block">Valor Estimado:</span>
                              <span className="font-extrabold text-base text-monte-verde">
                                {d.valueFormatted || (d.value ? `R$ ${d.value}` : '-')}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-monte-sereno/10 text-xs text-monte-sereno">
                            <div className="flex items-center gap-1.5">
                              <UserCheck className="w-3.5 h-3.5 text-monte-verde shrink-0" />
                              <span>
                                Responsável: <strong className="text-monte-azul">{d.assignedToName || d.responsavel || d.assignedTo?.name || 'Não atribuído'}</strong>
                                {d.assignedToEmail && <span className="text-slate-400 font-mono text-[10px] ml-1">({d.assignedToEmail})</span>}
                              </span>
                            </div>
                            {(d.dealDate || d.date) && (
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-monte-sereno shrink-0" />
                                <span>Retorno: <strong className="text-monte-azul">{d.dealDate || d.date}</strong></span>
                              </div>
                            )}
                          </div>

                          {d.notes && (
                            <div className="p-2.5 rounded-xl bg-monte-areiaSecao/40 border border-monte-sereno/10 text-xs text-slate-700 italic">
                              {d.notes}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Tab: Formulário Completo para Adicionar Contato no CRM */
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-monte-verde/10 via-monte-azul/5 to-transparent border border-monte-verde/20 flex items-start gap-3">
                <UserPlus className="w-6 h-6 text-monte-verde flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-monte-azul">Formulário Completo de Cadastro CRM</h4>
                  <p className="text-xs text-monte-sereno mt-0.5">
                    Preencha os campos organizados por categorias para cadastrar <strong className="text-monte-azul">{contact.phone}</strong> no CRM com todas as suas informações.
                  </p>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}

              <form onSubmit={handleCreateCrmContact} className="space-y-6 text-xs">
                {/* 👤 SEÇÃO 1: DADOS CADASTRAIS & PESSOAIS */}
                <div className="p-4 bg-monte-areiaSecao/30 rounded-2xl border border-monte-sereno/15 space-y-4">
                  <h5 className="font-bold text-monte-azul text-xs uppercase tracking-wider flex items-center gap-2 border-b border-monte-sereno/10 pb-2">
                    <User className="w-4 h-4 text-monte-verde" /> 👤 1. Dados Cadastrais & Pessoais
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 lg:col-span-1">
                      <label className="block text-monte-sereno font-semibold mb-1">
                        Nome Completo <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        className="input-rect text-xs w-full"
                        placeholder="Ex: João da Silva"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Telefone Principal (WhatsApp)</label>
                      <input
                        type="text"
                        disabled
                        className="input-rect text-xs w-full bg-monte-sereno/10 cursor-not-allowed text-monte-sereno"
                        value={formPhone}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Telefone Secundário / Recado</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="(11) 98888-7777"
                        value={formSecondaryPhone}
                        onChange={(e) => setFormSecondaryPhone(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Tipo de Pessoa</label>
                      <select
                        className="input-rect text-xs w-full"
                        value={formType}
                        onChange={(e) => setFormType(e.target.value)}
                      >
                        <option value="PF">Pessoa Física (PF)</option>
                        <option value="PJ">Pessoa Jurídica (PJ)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">CPF / CNPJ</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder={formType === 'PJ' ? '00.000.000/0001-00' : '000.000.000-00'}
                        value={formDocument}
                        onChange={(e) => setFormDocument(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">E-mail</label>
                      <input
                        type="email"
                        className="input-rect text-xs w-full"
                        placeholder="cliente@email.com"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Data de Aniversário / Nascimento</label>
                      <input
                        type="date"
                        className="input-rect text-xs w-full cursor-pointer"
                        value={formAnniversaryDate}
                        onChange={(e) => setFormAnniversaryDate(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Status no CRM</label>
                      <select
                        className="input-rect text-xs w-full"
                        value={formStatus}
                        onChange={(e) => setFormStatus(e.target.value)}
                      >
                        <option value="Ativo">Ativo</option>
                        <option value="Prospect">Prospect / Lead</option>
                        <option value="Inativo">Inativo</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1 flex items-center justify-between">
                        <span>Consultor Responsável</span>
                        {crmUsers.length > 0 && (
                          <span className="text-[10px] text-monte-sereno font-normal">
                            {crmUsers.length} do CRM
                          </span>
                        )}
                      </label>
                      {crmUsers.length > 0 ? (
                        <>
                          <select
                            className="input-rect text-xs w-full mb-1.5"
                            value={formAssignedToName}
                            onChange={(e) => setFormAssignedToName(e.target.value)}
                          >
                            <option value="">Selecione o Consultor / Responsável...</option>
                            {crmUsers.map((u) => (
                              <option key={u.id || u.name} value={u.name}>
                                {u.name} {u.email ? `(${u.email})` : ''} {u.role ? `• ${u.role}` : ''}
                              </option>
                            ))}
                            <option value="__custom__">Outro (digitar manualmente)...</option>
                          </select>
                          {(formAssignedToName === '__custom__' || (!crmUsers.some(u => u.name === formAssignedToName) && formAssignedToName !== '')) && (
                            <input
                              type="text"
                              className="input-rect text-xs w-full"
                              placeholder="Digite o nome do consultor..."
                              value={formAssignedToName === '__custom__' ? '' : formAssignedToName}
                              onChange={(e) => setFormAssignedToName(e.target.value)}
                            />
                          )}
                        </>
                      ) : (
                        <input
                          type="text"
                          className="input-rect text-xs w-full"
                          placeholder="Ex: Carlos Monteiro"
                          value={formAssignedToName}
                          onChange={(e) => setFormAssignedToName(e.target.value)}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* 📍 SEÇÃO 2: ENDEREÇO COMPLETO */}
                <div className="p-4 bg-monte-areiaSecao/30 rounded-2xl border border-monte-sereno/15 space-y-4">
                  <h5 className="font-bold text-monte-azul text-xs uppercase tracking-wider flex items-center gap-2 border-b border-monte-sereno/10 pb-2">
                    <MapPin className="w-4 h-4 text-monte-verde" /> 📍 2. Endereço Completo
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">CEP</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="00000-000"
                        value={formZipCode}
                        onChange={(e) => setFormZipCode(e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-2 lg:col-span-2">
                      <label className="block text-monte-sereno font-semibold mb-1">Logradouro / Rua</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="Av. Paulista"
                        value={formAddress}
                        onChange={(e) => setFormAddress(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Número</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="1000"
                        value={formNumber}
                        onChange={(e) => setFormNumber(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Complemento</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="Apto 42 / Bloco B"
                        value={formComplement}
                        onChange={(e) => setFormComplement(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Bairro</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="Bela Vista"
                        value={formNeighborhood}
                        onChange={(e) => setFormNeighborhood(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Cidade</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="São Paulo"
                        value={formCity}
                        onChange={(e) => setFormCity(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Estado (UF)</label>
                      <select
                        className="input-rect text-xs w-full"
                        value={formState}
                        onChange={(e) => setFormState(e.target.value)}
                      >
                        <option value="">Selecione o Estado...</option>
                        {UF_OPTIONS.map((uf) => (
                          <option key={uf} value={uf}>
                            {uf}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 🛡️ SEÇÃO 3: APÓLICE / SEGURO INICIAL */}
                <div className="p-4 bg-monte-areiaSecao/30 rounded-2xl border border-monte-sereno/15 space-y-4">
                  <h5 className="font-bold text-monte-azul text-xs uppercase tracking-wider flex items-center gap-2 border-b border-monte-sereno/10 pb-2">
                    <Shield className="w-4 h-4 text-monte-verde" /> 🛡️ 3. Apólice & Produto de Seguro Inicial
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Produto / Ramo</label>
                      <select
                        className="input-rect text-xs w-full mb-1.5"
                        value={PRODUCT_OPTIONS.includes(formProduct) ? formProduct : formProduct ? 'Outro' : ''}
                        onChange={(e) => {
                          if (e.target.value !== 'Outro') {
                            setFormProduct(e.target.value);
                          } else {
                            setFormProduct('');
                          }
                        }}
                      >
                        <option value="">Selecione o Produto...</option>
                        {PRODUCT_OPTIONS.map((prod) => (
                          <option key={prod} value={prod}>
                            {prod}
                          </option>
                        ))}
                      </select>
                      {(!PRODUCT_OPTIONS.includes(formProduct) || formProduct === 'Outro') && (
                        <input
                          type="text"
                          className="input-rect text-xs w-full"
                          placeholder="Ou digite o nome do produto..."
                          value={formProduct}
                          onChange={(e) => setFormProduct(e.target.value)}
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Seguradora</label>
                      <select
                        className="input-rect text-xs w-full mb-1.5"
                        value={INSURER_OPTIONS.includes(formInsurer) ? formInsurer : formInsurer ? 'Outra' : ''}
                        onChange={(e) => {
                          if (e.target.value !== 'Outra') {
                            setFormInsurer(e.target.value);
                          } else {
                            setFormInsurer('');
                          }
                        }}
                      >
                        <option value="">Selecione a Seguradora...</option>
                        {INSURER_OPTIONS.map((ins) => (
                          <option key={ins} value={ins}>
                            {ins}
                          </option>
                        ))}
                      </select>
                      {(!INSURER_OPTIONS.includes(formInsurer) || formInsurer === 'Outra') && (
                        <input
                          type="text"
                          className="input-rect text-xs w-full"
                          placeholder="Ou digite a seguradora..."
                          value={formInsurer}
                          onChange={(e) => setFormInsurer(e.target.value)}
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Número da Apólice</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full font-mono"
                        placeholder="Ex: 01.031.123456"
                        value={formPolicyNumber}
                        onChange={(e) => setFormPolicyNumber(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Valor do Prêmio (R$)</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="Ex: 2.450,00"
                        value={formPremiumValue}
                        onChange={(e) => setFormPremiumValue(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Data de Vencimento / Renovação</label>
                      <input
                        type="date"
                        className="input-rect text-xs w-full cursor-pointer"
                        value={formExpirationDate}
                        onChange={(e) => setFormExpirationDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* 💰 SEÇÃO 4: NEGÓCIO NO FUNIL DE VENDAS */}
                <div className="p-4 bg-monte-areiaSecao/30 rounded-2xl border border-monte-sereno/15 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-monte-verde/15 text-monte-verde flex items-center justify-center">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="font-bold text-monte-azul text-xs uppercase tracking-wider">
                        4. Negócio no Funil de Vendas (LEADS & Pipeline)
                      </h5>
                      <p className="text-[11px] text-monte-sereno">
                        Adicione novas oportunidades e cotações diretamente no funil do CRM.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOppProduct(formProduct || 'Auto');
                      setOppValue('');
                      setOppStatus('Enviar Cotação');
                      setOppDate('');
                      setOppNotes('');
                      setOppError(null);
                      setOppSuccess(null);
                      setShowOpportunityModal(true);
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-monte-verde to-emerald-700 text-white hover:opacity-95 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> Criar Oportunidade
                  </button>
                </div>

                {/* 📝 SEÇÃO 5: OBSERVAÇÕES E NOTAS */}
                <div className="p-4 bg-monte-areiaSecao/30 rounded-2xl border border-monte-sereno/15 space-y-3">
                  <h5 className="font-bold text-monte-azul text-xs uppercase tracking-wider flex items-center gap-2 border-b border-monte-sereno/10 pb-2">
                    <FileEdit className="w-4 h-4 text-monte-verde" /> 📝 Observações / Histórico Interno
                  </h5>
                  <div>
                    <textarea
                      rows={3}
                      className="input-rect text-xs w-full resize-none"
                      placeholder="Insira detalhes adicionais sobre o cliente, perfil de segurado, preferências ou notas de atendimento..."
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                    />
                  </div>
                </div>

                {/* Botão de Envio */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting || !formName.trim()}
                    className="w-full py-3.5 px-6 bg-gradient-to-r from-monte-verde via-emerald-600 to-monte-azul text-white font-bold rounded-2xl shadow-lg hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer text-sm"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Cadastrando Informações no CRM...</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-5 h-5" />
                        <span>Salvar Cadastro Completo no CRM Monteiro Seguros</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-monte-areiaSecao/40 border-t border-monte-sereno/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-monte-sereno/30 text-monte-azul text-sm font-semibold hover:bg-monte-sereno/10 transition-colors cursor-pointer"
            >
              Fechar
            </button>
            {activeTab === 'details' && (
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-monte-verde/10 text-monte-verde hover:bg-monte-verde hover:text-white transition-all text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserPlus className="w-4 h-4" /> Cadastrar Completo no CRM
              </button>
            )}
          </div>

          {contact.conversationId && onOpenConversation && (
            <button
              onClick={() => {
                onClose();
                onOpenConversation(contact);
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-monte-verde to-monte-azul text-white text-sm font-semibold shadow-md hover:opacity-95 transition-opacity flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" /> Abrir Conversa no WhatsApp
            </button>
          )}
        </div>
      </div>

      {/* Modal Dialog: Criar Oportunidade no LEADS & Pipeline */}
      {showOpportunityModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-monte-verde/30 flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-monte-azul via-emerald-700 to-monte-verde text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white shadow-inner">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-base leading-tight flex items-center gap-2">
                    Criar Oportunidade
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-white/20 text-white font-semibold">LEADS & Pipeline</span>
                  </h4>
                  <p className="text-xs text-white/80">
                    Envia diretamente para o funil do CRM da Monteiro Seguros via API
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOpportunityModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateOpportunity} className="p-6 space-y-4">
              {/* Alertas */}
              {oppError && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{oppError}</span>
                </div>
              )}
              {oppSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{oppSuccess}</span>
                </div>
              )}

              {/* Informações do Contato */}
              <div className="p-3 bg-monte-areiaSecao/50 rounded-2xl border border-monte-sereno/15 flex items-center justify-between text-xs">
                <div>
                  <span className="text-monte-sereno block text-[11px]">Cliente / Lead:</span>
                  <span className="font-bold text-monte-azul">{formName || contact.name || 'Contato WhatsApp'}</span>
                </div>
                <div className="text-right">
                  <span className="text-monte-sereno block text-[11px]">WhatsApp:</span>
                  <span className="font-mono text-monte-verde font-semibold">{formPhone || contact.phone}</span>
                </div>
              </div>

              {/* Produto da Cotação / Ramo */}
              <div>
                <label className="block text-xs font-bold text-monte-azul mb-1">
                  Produto da Cotação / Ramo <span className="text-red-500">*</span>
                </label>
                <select
                  className="input-rect text-xs w-full mb-1.5"
                  value={PRODUCT_OPTIONS.includes(oppProduct) ? oppProduct : oppProduct ? 'Outro' : ''}
                  onChange={(e) => {
                    if (e.target.value !== 'Outro') {
                      setOppProduct(e.target.value);
                    } else {
                      setOppProduct('');
                    }
                  }}
                >
                  <option value="">Selecione o Produto...</option>
                  {PRODUCT_OPTIONS.map((prod) => (
                    <option key={prod} value={prod}>
                      {prod}
                    </option>
                  ))}
                </select>
                {(!PRODUCT_OPTIONS.includes(oppProduct) || oppProduct === 'Outro') && (
                  <input
                    type="text"
                    className="input-rect text-xs w-full"
                    placeholder="Ou digite o nome do produto..."
                    value={oppProduct}
                    onChange={(e) => setOppProduct(e.target.value)}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Valor Estimado */}
                <div>
                  <label className="block text-xs font-bold text-monte-azul mb-1">
                    Valor Estimado (R$)
                  </label>
                  <input
                    type="text"
                    className="input-rect text-xs w-full"
                    placeholder="Ex: 3.500,00"
                    value={oppValue}
                    onChange={(e) => setOppValue(e.target.value)}
                  />
                </div>

                {/* Etapa no Funil */}
                <div>
                  <label className="block text-xs font-bold text-monte-azul mb-1">
                    Etapa no Funil (Pipeline)
                  </label>
                  <select
                    className="input-rect text-xs w-full"
                    value={oppStatus}
                    onChange={(e) => setOppStatus(e.target.value)}
                  >
                    {PIPELINE_STAGE_OPTIONS.map((stg) => (
                      <option key={stg} value={stg}>
                        {stg}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Responsável (Funcionário do CRM) */}
              <div>
                <label className="block text-xs font-bold text-monte-azul mb-1 flex items-center justify-between">
                  <span>Responsável (Funcionário do CRM)</span>
                  <span className="text-[10px] text-monte-sereno font-normal">
                    {loadingCrmUsers ? 'Carregando equipe...' : `${crmUsers.length} disponíveis`}
                  </span>
                </label>
                <select
                  className="input-rect text-xs w-full mb-1.5"
                  value={oppAssignedToName}
                  onChange={(e) => {
                    const selectedName = e.target.value;
                    setOppAssignedToName(selectedName);
                    const foundUser = crmUsers.find(u => u.name === selectedName);
                    if (foundUser) {
                      setOppAssignedToEmail(foundUser.email || '');
                      setOppAssignedToId(foundUser.id || '');
                    } else {
                      setOppAssignedToEmail('');
                      setOppAssignedToId('');
                    }
                  }}
                >
                  <option value="">Selecione o Responsável...</option>
                  {crmUsers.map((u) => (
                    <option key={u.id || u.name} value={u.name}>
                      {u.name} {u.email ? `(${u.email})` : ''} {u.role ? `• ${u.role}` : ''}
                    </option>
                  ))}
                  <option value="__custom__">Outro (digitar manualmente)...</option>
                </select>
                {(oppAssignedToName === '__custom__' || (!crmUsers.some(u => u.name === oppAssignedToName) && oppAssignedToName !== '')) && (
                  <input
                    type="text"
                    className="input-rect text-xs w-full"
                    placeholder="Digite o nome do responsável..."
                    value={oppAssignedToName === '__custom__' ? '' : oppAssignedToName}
                    onChange={(e) => setOppAssignedToName(e.target.value)}
                  />
                )}
                <p className="text-[11px] text-emerald-700 mt-1 flex items-center gap-1 font-medium">
                  <Mail className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  O CRM disparará um e-mail de notificação para o responsável com os dados da oportunidade.
                </p>
              </div>

              {/* Data de Agendamento / Retorno */}
              <div>
                <label className="block text-xs font-bold text-monte-azul mb-1">
                  Data de Agendamento / Retorno (Opcional - digite ou escolha no calendário)
                </label>
                <input
                  type="date"
                  className="input-rect text-xs w-full cursor-pointer"
                  value={oppDate}
                  onChange={(e) => setOppDate(e.target.value)}
                />
              </div>

              {/* Observações */}
              <div>
                <label className="block text-xs font-bold text-monte-azul mb-1">
                  Notas / Observações da Cotação
                </label>
                <textarea
                  rows={3}
                  className="input-rect text-xs w-full resize-none"
                  placeholder="Descreva detalhes solicitados pelo cliente, coberturas ou dados adicionais..."
                  value={oppNotes}
                  onChange={(e) => setOppNotes(e.target.value)}
                />
              </div>

              {/* Botões de Ação */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-monte-sereno/15">
                <button
                  type="button"
                  onClick={() => setShowOpportunityModal(false)}
                  disabled={oppSubmitting}
                  className="px-4 py-2.5 rounded-xl border border-monte-sereno/30 text-monte-sereno hover:text-monte-azul text-xs font-bold cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={oppSubmitting || !oppProduct.trim()}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-monte-verde to-emerald-700 text-white text-xs font-bold shadow-md hover:opacity-95 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {oppSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enviando para o CRM...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Criar Oportunidade no Funil</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
