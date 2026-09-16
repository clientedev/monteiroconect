import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { whatsappApi, contactApi } from '../lib/api';
import { getSocket } from '../lib/socket';
import { Search, Users, ChevronRight, Smartphone, ShieldCheck } from 'lucide-react';
import CrmContactModal from '../components/CrmContactModal';

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
  const [selectedContactForCrm, setSelectedContactForCrm] = useState<any | null>(null);

  const loadContacts = useCallback(async () => {
    if (!selectedAccountId) {
      setContacts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await contactApi.list(selectedAccountId, search);
      setContacts(data.contacts || []);
    } catch {
      setContacts([]);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="section-title">Agenda de contatos</h2>
          <p className="text-sm text-monte-sereno mt-1">
            Clique no nome de um contato para consultar seus dados completos no CRM Monteiro Seguros
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

      <div className="relative max-w-xl">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno" />
        <input
          type="search"
          className="input-rect pl-10"
          placeholder="Buscar pelo nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card-static overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-monte-verde border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-monte-sereno mt-3">Carregando contatos...</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-12 text-center text-monte-sereno">
            {accounts.length === 0 ? (
              <>
                <Smartphone className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Conecte um WhatsApp para carregar sua agenda.</p>
              </>
            ) : (
              <>
                <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nenhum contato encontrado.</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-monte-sereno/10">
            {contacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => handleContactClick(contact)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-monte-areiaSecao/60 transition-colors group cursor-pointer"
              >
                <ContactAvatar id={contact.id} name={contact.name} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-monte-azul truncate group-hover:text-monte-verde transition-colors">
                    {contact.name || 'Contato sem nome'}
                  </span>
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
                  <span>Consultar CRM</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            ))}
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
