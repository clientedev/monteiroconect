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

export default function CrmContactModal({
  contact,
  onClose,
  onOpenConversation,
}: CrmContactModalProps) {
  const [loading, setLoading] = useState(true);
  const [crmData, setCrmData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Estados do formulário de criação de contato no CRM
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDocument, setFormDocument] = useState('');
  const [formType, setFormType] = useState('PF');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const fetchCrmData = (phone: string, id: string) => {
    setLoading(true);
    setError(null);

    contactApi
      .crmLookup(phone)
      .then((data) => {
        setCrmData(data);
      })
      .catch((err) => {
        contactApi
          .crmLookupById(id)
          .then((data) => setCrmData(data))
          .catch(() => setError(err?.message || 'Falha ao consultar CRM'));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!contact) return;
    setCrmData(null);
    setFormName(contact.name || '');
    setFormPhone(contact.phone || '');
    setFormEmail('');
    setFormDocument('');
    setFormType('PF');
    setFormError(null);
    setFormSuccess(null);

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
        email: formEmail.trim() || undefined,
        document: formDocument.trim() || undefined,
        type: formType,
      });

      if (res.ok) {
        setFormSuccess('Contato cadastrado com sucesso no CRM!');
        // Atualiza a consulta para buscar os dados recém-cadastrados
        setTimeout(() => {
          if (contact) {
            fetchCrmData(contact.phone, contact.id);
          }
        }, 1000);
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
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-monte-sereno/20">
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
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white"
            title="Fechar"
          >
            <X className="w-5 h-5" />
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
          ) : error ? (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">Erro na consulta do CRM</p>
                <p className="mt-1 text-xs opacity-90">{error}</p>
              </div>
            </div>
          ) : found ? (
            <>
              {/* Badge de Status Cadastrado */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-sm font-semibold">Cliente Cadastrado no CRM</span>
                </div>
                {crmContact?.status && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                    {crmContact.status}
                  </span>
                )}
              </div>

              {/* 🏷️ Produtos no Cadastro (Etiquetas CRM) */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-monte-azul flex items-center gap-2 border-b border-monte-sereno/10 pb-2">
                  <Shield className="w-4 h-4 text-monte-verde" /> 🏷️ Produtos no Cadastro (CRM)
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
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
                  <div className="text-xs font-semibold px-2 py-0.5 bg-monte-verde/10 text-monte-verde rounded-full">
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
                  <div className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
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
            /* Contact Not Found in CRM -> Render Form to Add Contact */
            <div className="py-4 space-y-5">
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                <UserX className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-amber-900">Contato não encontrado no CRM</h4>
                  <p className="text-xs text-amber-800 mt-0.5">
                    O número <strong className="text-amber-950">{crmData?.query?.phone || contact.phone}</strong> ainda não consta na base do CRM da Monteiro Seguros.
                  </p>
                </div>
              </div>

              <div className="bg-monte-areiaSecao/40 border border-monte-sereno/15 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-monte-sereno/10 pb-2">
                  <UserPlus className="w-5 h-5 text-monte-verde" />
                  <h4 className="font-bold text-sm text-monte-azul">Cadastrar Contato no CRM Monteiro Seguros</h4>
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

                <form onSubmit={handleCreateCrmContact} className="space-y-3 text-xs">
                  <div>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">Telefone / WhatsApp</label>
                      <input
                        type="text"
                        disabled
                        className="input-rect text-xs w-full bg-monte-sereno/10 cursor-not-allowed"
                        value={formPhone}
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
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">E-mail (opcional)</label>
                      <input
                        type="email"
                        className="input-rect text-xs w-full"
                        placeholder="cliente@email.com"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-monte-sereno font-semibold mb-1">CPF / CNPJ (opcional)</label>
                      <input
                        type="text"
                        className="input-rect text-xs w-full"
                        placeholder="000.000.000-00"
                        value={formDocument}
                        onChange={(e) => setFormDocument(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={submitting || !formName.trim()}
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-monte-verde to-monte-azul text-white font-bold rounded-xl shadow-md hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Cadastrando no CRM...</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          <span>Salvar Cadastro no CRM</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-monte-areiaSecao/40 border-t border-monte-sereno/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-monte-sereno/30 text-monte-azul text-sm font-semibold hover:bg-monte-sereno/10 transition-colors"
          >
            Fechar
          </button>

          {contact.conversationId && onOpenConversation && (
            <button
              onClick={() => {
                onClose();
                onOpenConversation(contact);
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-monte-verde to-monte-azul text-white text-sm font-semibold shadow-md hover:opacity-95 transition-opacity flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4" /> Abrir Conversa no WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
