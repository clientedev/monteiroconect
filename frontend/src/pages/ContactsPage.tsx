import { Fragment, useState, useEffect } from 'react';
import { whatsappApi, contactApi } from '../lib/api';
import { getSocket } from '../lib/socket';
import { Search, Users, Edit2, Save, X, StickyNote } from 'lucide-react';

export default function ContactsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    whatsappApi.list().then(data => {
      setAccounts(data);
      if (data.length > 0) setSelectedAccountId(data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedAccountId) return;
    setLoading(true);
    contactApi.list(selectedAccountId, search)
      .then(data => setContacts(data.contacts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedAccountId, search]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !selectedAccountId) return;
    const refresh = (data: { accountId: string }) => {
      if (data.accountId !== selectedAccountId) return;
      contactApi.list(selectedAccountId, search).then(data => setContacts(data.contacts || [])).catch(() => {});
    };
    socket.on('contacts:updated', refresh);
    return () => { socket.off('contacts:updated', refresh); };
  }, [selectedAccountId, search]);

  const handleEdit = (contact: any) => {
    setEditingId(contact.id);
    setEditName(contact.name || '');
    setEditNotes(contact.notes || '');
  };

  const handleSave = async (id: string) => {
    try {
      await contactApi.update(id, { name: editName.trim() || undefined, notes: editNotes });
      setContacts(prev => prev.map(c => c.id === id ? { ...c, name: editName.trim() || null, notes: editNotes } : c));
      setEditingId(null);
    } catch {}
  };

  return (
    <div className="space-y-8">
      <h2 className="section-title">Contatos</h2>

      <div className="flex gap-3">
        {accounts.length > 0 && (
          <select className="input-rect w-auto" value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}>
            {accounts.map((a: any) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno" />
          <input type="text" className="input-rect pl-10" placeholder="Buscar contatos..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card-static overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-monte-areiaSecao/60 border-b border-monte-sereno/15">
              <tr>
                <th className="table-header">Contato</th>
                <th className="table-header">Telefone</th>
                <th className="table-header">Última Mensagem</th>
                <th className="table-header">Último Contato</th>
                <th className="table-header w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-monte-sereno/10">
              {contacts.map(c => (
                <Fragment key={c.id}>
                <tr className="hover:bg-monte-areiaSecao/40 transition-colors">
                  <td className="table-row">
                    {editingId === c.id ? (
                      <input type="text" className="input-rect text-sm py-1 w-full" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave(c.id)} autoFocus />
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-gradient-to-br from-monte-verde to-monte-azul rounded-full flex items-center justify-center text-xs font-bold text-white">
                          {(c.name || c.phone)[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-monte-azul">{c.name || 'Sem nome'}</span>
                      </div>
                    )}
                  </td>
                  <td className="table-row text-monte-sereno">{c.phone}</td>
                  <td className="table-row text-monte-sereno truncate max-w-[200px]">{c.lastMessage || '—'}</td>
                  <td className="table-row text-monte-sereno/70">{c.lastContact ? new Date(c.lastContact).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="table-row">
                    {editingId === c.id ? (
                      <div className="flex gap-1.5">
                        <button onClick={() => handleSave(c.id)} className="text-emerald-600 hover:text-emerald-700"><Save className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="text-monte-sereno hover:text-monte-azul"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => handleEdit(c)} className="text-monte-sereno hover:text-monte-verde"><Edit2 className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
                {editingId === c.id && (
                  <tr className="bg-monte-areiaSecao/30">
                    <td colSpan={5} className="px-4 pb-3">
                      <label className="flex items-start gap-2 text-xs text-monte-sereno">
                        <StickyNote className="w-4 h-4 mt-2" />
                        <textarea className="input-rect text-sm min-h-16" placeholder="Anotações do lead: necessidade, próximo passo, origem..." value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                      </label>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {contacts.length === 0 && !loading && (
            <div className="p-12 text-center text-monte-sereno text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Nenhum contato encontrado
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
