import { useState, useEffect } from 'react';
import { whatsappApi, contactApi } from '../lib/api';
import { Search, Users, Edit2, Save, X } from 'lucide-react';

export default function ContactsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    whatsappApi.list().then(data => {
      setAccounts(data.filter((a: any) => a.status === 'CONNECTED'));
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

  const handleEdit = (contact: any) => {
    setEditingId(contact.id);
    setEditName(contact.name || '');
  };

  const handleSave = async (id: string) => {
    try {
      await contactApi.update(id, { name: editName });
      setContacts(prev => prev.map(c => c.id === id ? { ...c, name: editName } : c));
      setEditingId(null);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Contatos</h2>

      <div className="flex gap-4">
        {accounts.length > 0 && (
          <select className="input w-auto" value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}>
            {accounts.map((a: any) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" className="input pl-9" placeholder="Buscar contatos..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Contato</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Telefone</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Última Mensagem</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Último Contato</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contacts.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    {editingId === c.id ? (
                      <input type="text" className="input text-sm py-1" value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave(c.id)} autoFocus />
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">
                          {(c.name || c.phone)[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-medium">{c.name || '—'}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{c.phone}</td>
                  <td className="px-5 py-3 text-sm text-gray-500 truncate max-w-[200px]">{c.lastMessage || '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-400">{c.lastContact ? new Date(c.lastContact).toLocaleDateString('pt-BR') : '—'}</td>
                  <td className="px-5 py-3">
                    {editingId === c.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleSave(c.id)} className="text-green-600 hover:text-green-700"><Save className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => handleEdit(c)} className="text-gray-400 hover:text-brand-600"><Edit2 className="w-4 h-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {contacts.length === 0 && !loading && (
            <div className="p-12 text-center text-gray-400 text-sm">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Nenhum contato encontrado
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
