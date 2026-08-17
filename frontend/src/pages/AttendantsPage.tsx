import { useState, useEffect } from 'react';
import { authApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Users, Plus, Trash2, Shield, Eye, UserCheck } from 'lucide-react';

export default function AttendantsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'attendant' });
  const [error, setError] = useState('');

  const load = async () => {
    try { setUsers(await authApi.listUsers()); } catch {}
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setError('');
    try {
      await authApi.createUser(form);
      setShowCreate(false);
      setForm({ username: '', email: '', password: '', role: 'attendant' });
      load();
    } catch (err: any) { setError(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover este usuário?')) return;
    try { await authApi.deleteUser(id); load(); } catch (err: any) { alert(err.message); }
  };

  const roleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="w-4 h-4 text-red-500" />;
      case 'supervisor': return <Eye className="w-4 h-4 text-blue-500" />;
      default: return <UserCheck className="w-4 h-4 text-green-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Atendentes</h2>
        {user?.role === 'admin' && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Usuário
          </button>
        )}
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Usuário</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Função</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-xs font-bold text-brand-700">
                        {u.username[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium">{u.username}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-600">{u.email}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      {roleIcon(u.role)}
                      <span className="text-sm capitalize">{u.role}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={u.isActive ? 'badge-green' : 'badge-gray'}>
                      {u.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {user?.role === 'admin' && u.id !== user.id && (
                      <button onClick={() => handleDelete(u.id)} className="text-gray-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Novo Usuário</h3>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">{error}</div>}
            <div className="space-y-3">
              <input type="text" className="input" placeholder="Usuário" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
              <input type="email" className="input" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <input type="password" className="input" placeholder="Senha (mín. 6 caracteres)" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="admin">Administrador</option>
                <option value="supervisor">Supervisor</option>
                <option value="attendant">Atendente</option>
              </select>
              <button onClick={handleCreate} disabled={!form.username || !form.email || !form.password} className="btn-primary w-full">Criar Usuário</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
