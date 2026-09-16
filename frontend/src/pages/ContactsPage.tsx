import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { whatsappApi, contactApi } from '../lib/api';
import { getSocket } from '../lib/socket';
import {
  Search,
  Users,
  ChevronRight,
  Smartphone,
  ShieldCheck,
  Filter,
  UserX,
  DollarSign,
  Loader2,
} from 'lucide-react';
import CrmContactModal from '../components/CrmContactModal';

type CrmFilterType = 'all' | 'registered' | 'unregistered' | 'with_deals';

function ContactAvatar({ id, name }: { id: string; name: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src={`/api/contacts/${id}/avatar`}
        alt=""
        onError={() => setFailed(true)}
        className="w-12 h-12 rounded-2xl object-cover flex-shrink-0 shadow-sm bg-monte-sereno/20"
      />
    );
  }
  return (
    <div className="w-12 h-12 bg-gradient-to-br from-monte-verde to-monte-azul rounded-2xl flex items-center justify-center text-base font-bold text-white flex-shrink-0">
      {(name || '?')[0].toUpperCase()}
    </div>
  );
}

export default function ContactsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [selectedContactForCrm, setSelectedContactForCrm] = useState<any | null>(null);

  // Filtros por CRM
  const [crmFilter, setCrmFilter] = useState<CrmFilterType>('all');
  const [crmStatuses, setCrmStatuses] = useState<
    Record<
      string,
      {
        found: boolean;
        activePoliciesCount?: number;
        activeDealsCount?: number;
        products?: string[];
      }
    >
  >({});


  const loadContacts = useCallback(async () => {
    if (!selectedAccountId) {
      setContacts([]);
      setCrmStatuses({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await contactApi.list(selectedAccountId, search);
      const list = data.contacts || [];
      setContacts(list);

      // Consulta em lote o CRM para os contatos carregados
      const phones = list.map((c: any) => c.phone).filter(Boolean);
      if (phones.length > 0) {
        setLoadingCrm(true);
        contactApi
          .crmBatchLookup(phones)
          .then((res) => {
            const map: Record<string, any> = {};
            if (res?.results) {
              Object.entries(res.results).forEach(([phone, info]: [string, any]) => {
                map[phone] = {
                  found: info.found === true,
                  activePoliciesCount: info.insurance?.activePoliciesCount || 0,
                  activeDealsCount: info.pipeline?.activeDealsCount || 0,
                  products: info.products || [],
                };
              });
            }
            setCrmStatuses(map);
          })
          .catch(() => {})
          .finally(() => setLoadingCrm(false));
      } else {
        setCrmStatuses({});
      }
    } catch {
      setContacts([]);
      setCrmStatuses({});
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, search]);

  useEffect(() => {
    whatsappApi
      .list()
      .then((data) => {
        setAccounts(data);
        if (data.length > 0) setSelectedAccountId(data[0].id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !selectedAccountId) return;
    const refresh = (data: { accountId: string }) => {
      if (data.accountId === selectedAccountId) loadContacts();
    };
    socket.on('contacts:updated', refresh);
    socket.on('history:imported', refresh);
    return () => {
      socket.off('contacts:updated', refresh);
      socket.off('history:imported', refresh);
    };
  }, [selectedAccountId, loadContacts]);

  const handleContactClick = (contact: any) => {
    setSelectedContactForCrm(contact);
  };

  const openConversation = (contact: any) => {
    if (!contact.conversationId) return;
    navigate('/conversations', {
      state: { conversationId: contact.conversationId, accountId: selectedAccountId },
    });
  };

  // Filtragem local dos contatos com base no filtro selecionado e produtos
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const status = crmStatuses[c.phone];
      if (crmFilter === 'registered') {
        if (status?.found !== true) return false;
      } else if (crmFilter === 'unregistered') {
        if (status?.found !== false) return false;
      } else if (crmFilter === 'with_deals') {
        if ((status?.activeDealsCount || 0) <= 0) return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchPhone = (c.phone || '').toLowerCase().includes(q);
        const matchProduct = (status?.products || []).some((p: string) => p.toLowerCase().includes(q));
        return matchName || matchPhone || matchProduct;
      }

      return true;
    });
  }, [contacts, crmStatuses, crmFilter, search]);

  // Estatísticas de contagem para as abas
  const counts = useMemo(() => {
    let registered = 0;
    let unregistered = 0;
    let withDeals = 0;

    contacts.forEach((c) => {
      const status = crmStatuses[c.phone];
      if (status?.found === true) registered++;
      if (status?.found === false) unregistered++;
      if ((status?.activeDealsCount || 0) > 0) withDeals++;
    });

    return {
      all: contacts.length,
      registered,
      unregistered,
      withDeals,
    };
  }, [contacts, crmStatuses]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="section-title">Agenda de contatos</h2>
          <p className="text-sm text-monte-sereno mt-1">
            Clique em um contato para consultar seus dados completos e produtos no CRM Monteiro Seguros
          </p>
        </div>
        {accounts.length > 0 && (
          <select
            className="input-rect w-full sm:w-auto"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
          >
            {accounts.map((account: any) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Busca & Filtros por CRM */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno" />
          <input
            type="search"
            className="input-rect pl-10"
            placeholder="Buscar pelo nome, telefone ou produto do CRM..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Abas de Filtro de CRM */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-monte-areiaSecao/80 border border-monte-sereno/15 rounded-2xl">
          <button
            type="button"
            onClick={() => setCrmFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              crmFilter === 'all'
                ? 'bg-white text-monte-azul shadow-xs font-bold'
                : 'text-monte-sereno hover:text-monte-azul'
            }`}
          >
            <span>Todos</span>
            <span className="px-1.5 py-0.2 rounded-full bg-monte-sereno/10 text-[10px]">
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setCrmFilter('registered')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              crmFilter === 'registered'
                ? 'bg-emerald-500 text-white shadow-xs font-bold'
                : 'text-monte-sereno hover:text-emerald-700'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>No CRM</span>
            {Object.keys(crmStatuses).length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-black/10 text-[10px]">
                {counts.registered}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCrmFilter('unregistered')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              crmFilter === 'unregistered'
                ? 'bg-amber-500 text-white shadow-xs font-bold'
                : 'text-monte-sereno hover:text-amber-700'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Sem CRM</span>
            {Object.keys(crmStatuses).length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-black/10 text-[10px]">
                {counts.unregistered}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setCrmFilter('with_deals')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              crmFilter === 'with_deals'
                ? 'bg-blue-600 text-white shadow-xs font-bold'
                : 'text-monte-sereno hover:text-blue-700'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Funil / Oportunidades</span>
            {Object.keys(crmStatuses).length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-black/10 text-[10px]">
                {counts.withDeals}
              </span>
            )}
          </button>

          {loadingCrm && (
            <span className="text-[11px] text-monte-verde flex items-center gap-1 px-2 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> Verificando CRM...
            </span>
          )}
        </div>
      </div>

      {/* Lista de Contatos */}
      <div className="card-static overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-monte-verde border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-monte-sereno mt-3">Carregando contatos...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="p-12 text-center text-monte-sereno">
            {accounts.length === 0 ? (
              <>
                <Smartphone className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Conecte um WhatsApp para carregar sua agenda.</p>
              </>
            ) : (
              <>
                <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nenhum contato encontrado com o filtro selecionado.</p>
                {crmFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setCrmFilter('all')}
                    className="mt-3 text-xs text-monte-verde font-semibold hover:underline"
                  >
                    Limpar filtro e ver todos ({contacts.length})
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-monte-sereno/10">
            {filteredContacts.map((contact) => {
              const status = crmStatuses[contact.phone];
              const isFound = status?.found === true;
              const isNotFound = status?.found === false;
              const dealsCount = status?.activeDealsCount || 0;
              const products: string[] = status?.products || [];

              return (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleContactClick(contact)}
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-monte-areiaSecao/60 transition-colors group cursor-pointer"
                >
                  <ContactAvatar id={contact.id} name={contact.name} />

                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="block text-sm font-semibold text-monte-azul truncate group-hover:text-monte-verde transition-colors">
                        {contact.name || 'Contato sem nome'}
                      </span>

                      {/* Badges de Status do CRM */}
                      {isFound && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" /> CRM
                        </span>
                      )}

                      {dealsCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                          <DollarSign className="w-3 h-3 text-blue-600" /> {dealsCount} negócio(s)
                        </span>
                      )}

                      {isNotFound && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                          Sem cadastro CRM
                        </span>
                      )}
                    </span>

                    {/* Etiquetas de Produtos do CRM */}
                    {products.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {products.map((prod: string, pIdx: number) => (
                          <span
                            key={pIdx}
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300/80 shadow-2xs"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            {prod}
                          </span>
                        ))}
                      </div>
                    )}

                    <span className="flex items-center gap-2 text-xs text-monte-sereno mt-1">
                      <span>{contact.phone}</span>
                      <span>•</span>
                      <span>
                        {contact.conversationCount || 0}{' '}
                        {contact.conversationCount === 1 ? 'conversa' : 'conversas'}
                      </span>
                    </span>
                  </span>

                  <div className="flex items-center gap-2 text-xs text-monte-verde font-semibold bg-monte-verde/10 px-3 py-1.5 rounded-xl group-hover:bg-monte-verde group-hover:text-white transition-all flex-shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Ver Cadastro & Produtos</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>


      {/* Modal do CRM */}
      {selectedContactForCrm && (
        <CrmContactModal
          contact={selectedContactForCrm}
          onClose={() => setSelectedContactForCrm(null)}
          onOpenConversation={openConversation}
        />
      )}
    </div>
  );
}
