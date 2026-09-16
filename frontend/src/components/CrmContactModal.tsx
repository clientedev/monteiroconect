import { useState, useEffect } from 'react';
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
} from 'lucide-react';

interface CrmContactModalProps {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    conversationId?: string | null;
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
  'Saúde',
  'Vida',
  'Residencial',
  'Empresarial',
  'Odonto',
  'Consórcio',
  'Previdência',
  'Fiança Locatícia',
  'Responsabilidade Civil',
  'Outro',
];

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export default function CrmContactModal({
  contact,
  onClose,
  onOpenConversation,
}: CrmContactModalProps) {
  const [loading, setLoading] = useState(true);
  const [crmData, setCrmData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Aba ativa: 'details' (Visualizar) ou 'create' (Cadastrar)
  const [activeTab, setActiveTab] = useState<'details' | 'create'>('details');

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
  const [formDealStatus, setFormDealStatus] = useState('Cotação');
  const [formNotes, setFormNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

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
      crmC.anniversaryDate || crmC.birthDate || crmC.dataNascimento || raw.anniversaryDate || raw.birthDate || raw.dataNascimento || ''
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
    setFormProduct(
      (data?.products && data.products.length > 0 ? data.products[0] : null) ||
      firstPolicy.product || firstPolicy.produto || crmC.product || raw.product || ''
    );
    setFormInsurer(firstPolicy.insurer || firstPolicy.seguradora || raw.insurer || raw.seguradora || '');
    setFormPolicyNumber(firstPolicy.policyNumber || firstPolicy.apolice || firstPolicy.numeroApolice || raw.policyNumber || raw.apolice || '');
    setFormPremiumValue(firstPolicy.premiumValue || firstPolicy.premio || firstPolicy.valor || raw.premiumValue || raw.premio || '');
    setFormExpirationDate(firstPolicy.expirationDate || firstPolicy.vencimento || raw.expirationDate || raw.vencimento || '');

    // Funil
    setFormDealProduct(firstDeal.product || firstDeal.produto || firstDeal.title || firstDeal.titulo || raw.dealProduct || '');
    setFormDealValue(firstDeal.valueFormatted || (firstDeal.value ? String(firstDeal.value) : '') || raw.dealValue || raw.valorNegocio || '');
    setFormDealStatus(firstDeal.status || firstDeal.etapa || raw.dealStatus || 'Cotação');

    // Observações
    setFormNotes(crmC.notes || crmC.observacoes || raw.notes || raw.observacoes || '');
  };

  const fetchCrmData = (phone: string, id: string) => {
    setLoading(true);
    setError(null);

    contactApi
      .crmLookup(phone)
      .then((data) => {
        setCrmData(data);
        populateFormFromCrmData(data, contact);
        if (data && data.found === true) {
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
            if (data && data.found === true) {
              setActiveTab('details');
            } else {
              setActiveTab('create');
            }
          })
          .catch(() => {
            setError(err?.message || 'Contato não localizado no CRM');
            setActiveTab('create');
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
    setFormDealStatus('Cotação');
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
        insurer: formInsurer.trim() || undefined,
        policyNumber: formPolicyNumber.trim() || undefined,
        premiumValue: formPremiumValue.trim() || undefined,
        expirationDate: formExpirationDate.trim() || undefined,

        dealProduct: formDealProduct.trim() || undefined,
        dealValue: formDealValue.trim() || undefined,
        dealStatus: formDealStatus,
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
        <div className="px-6 pt-3 bg-monte-areiaSecao/40 border-b border-monte-sereno/15 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
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
            onClick={() => setActiveTab('create')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
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
                      <DollarSign className="w-4 h-4 text-monte-verde" /> 💰 Negociações no Funil
                    </h4>
                    <div className="text-xs font-semibold px-2.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      {pipeline?.activeDealsCount || 0} oportunidades
                    </div>
                  </div>

                  {!pipeline?.deals || pipeline.deals.length === 0 ? (
                    <p className="text-xs text-monte-sereno italic p-3 bg-monte-areiaSecao/30 rounded-xl">
                      Nenhuma oportunidade ativa no funil.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {pipeline.deals.map((d: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-3 bg-monte-areiaSecao/50 rounded-xl border border-monte-sereno/10 text-xs flex items-center justify-between"
                        >
                          <div>
                            <p className="font-bold text-monte-azul text-sm">
                              {d.product || d.produto || d.title || 'Oportunidade'}
                            </p>
                            <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-monte-azul/10 text-monte-azul text-[11px]">
                              {d.status || d.etapa || 'Em andamento'}
                            </span>
                          </div>
                          <div className="text-right font-bold text-monte-verde text-sm">
                            {d.valueFormatted || (d.value ? `R$ ${d.value}` : '-')}
                          </div>
                        </div>
                      ))}
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
                        className="input-rect text-xs w-full"
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
                      <label className="block text-monte-sereno font-semibold mb-1">Consultor Responsável</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="Ex: Carlos Monteiro"
                        value={formAssignedToName}
                        onChange={(e) => setFormAssignedToName(e.target.value)}
                      />
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
                        className="input-rect text-xs w-full"
                        value={formExpirationDate}
                        onChange={(e) => setFormExpirationDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* 💰 SEÇÃO 4: NEGÓCIO NO FUNIL DE VENDAS */}
                <div className="p-4 bg-monte-areiaSecao/30 rounded-2xl border border-monte-sereno/15 space-y-4">
                  <h5 className="font-bold text-monte-azul text-xs uppercase tracking-wider flex items-center gap-2 border-b border-monte-sereno/10 pb-2">
                    <DollarSign className="w-4 h-4 text-monte-verde" /> 💰 4. Negócio no Funil de Vendas (CRM)
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Produto da Cotação / Oportunidade</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="Ex: Cotação Seguro Auto"
                        value={formDealProduct}
                        onChange={(e) => setFormDealProduct(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Valor Estimado do Negócio (R$)</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="Ex: 3.500,00"
                        value={formDealValue}
                        onChange={(e) => setFormDealValue(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Etapa no Funil</label>
                      <select
                        className="input-rect text-xs w-full"
                        value={formDealStatus}
                        onChange={(e) => setFormDealStatus(e.target.value)}
                      >
                        <option value="Cotação">Cotação</option>
                        <option value="Proposta Enviada">Proposta Enviada</option>
                        <option value="Em Negociação">Em Negociação</option>
                        <option value="Fechado / Ganho">Fechado / Ganho</option>
                        <option value="Perdido">Perdido</option>
                      </select>
                    </div>
                  </div>
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
    </div>
  );
}
