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
      case 'admin': return <Shield className="w-4 h-4 text-monte-terracota" />;
      case 'supervisor': return <Eye className="w-4 h-4 text-sky-500" />;
      default: return <UserCheck className="w-4 h-4 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="section-title">Atendentes</h2>
        {user?.role === 'admin' && (
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Usuário
          </button>
        )}
      </div>

      <div className="card-static overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-monte-areiaSecao/60 border-b border-monte-sereno/15">
              <tr>
                <th className="table-header">Usuário</th>
                <th className="table-header">Email</th>
                <th className="table-header">Função</th>
                <th className="table-header">Status</th>
                <th className="table-header w-20">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-monte-sereno/10">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-monte-areiaSecao/40 transition-colors">
                  <td className="table-row">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 bg-gradient-to-br from-monte-verde to-monte-azul rounded-full flex items-center justify-center text-xs font-bold text-white">
                        {u.username[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-monte-azul">{u.username}</span>
                    </div>
                  </td>
                  <td className="table-row text-monte-sereno">{u.email}</td>
                  <td className="table-row">
                    <div className="flex items-center gap-1.5">
                      {roleIcon(u.role)}
                      <span className="text-sm capitalize text-monte-azul">{u.role}</span>
                    </div>
                  </td>
                  <td className="table-row">
                    <span className={u.isActive ? 'badge-green' : 'badge-gray'}>
                      {u.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="table-row">
                    {user?.role === 'admin' && u.id !== user.id && (
                      <button onClick={() => handleDelete(u.id)} className="text-monte-sereno hover:text-monte-terracota transition-colors">
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
        <div className="fixed inset-0 z-50 bg-monte-azul/30 backdrop-blur-sm flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-4xl p-8 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold font-display text-monte-azul mb-6">Novo Usuário</h3>
            {error && <div className="bg-monte-terracota/15 border border-monte-terracota/30 text-monte-terracota px-4 py-3 rounded-2xl text-sm mb-4">{error}</div>}
            <div className="space-y-4">
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
