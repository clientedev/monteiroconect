import { useState, useEffect } from 'react';
import { authApi, whatsappApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Users, Plus, Trash2, Shield, Eye, UserCheck, Key, Smartphone, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AttendantsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'attendant' });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  // WhatsApp Assignments state
  const [assigningUser, setAssigningUser] = useState<any | null>(null);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  // Password Reset state
  const [resettingUser, setResettingUser] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const load = async () => {
    try { setUsers(await authApi.listUsers()); } catch {}
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (user?.role === 'admin') whatsappApi.list().then(setAccounts).catch(() => {}); }, [user?.role]);

  const openAssignments = (target: any) => {
    setAssigningUser(target);
    setAssignedIds((target.whatsappAssignments || []).map((a: any) => a.whatsappId));
  };

  const saveAssignments = async () => {
    if (!assigningUser) return;
    setAssignLoading(true);
    try {
      await authApi.setWhatsApps(assigningUser.id, assignedIds);
      setAssigningUser(null);
      load();
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar contas');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleCreate = async () => {
    setCreateError('');
    setCreateLoading(true);
    try {
      await authApi.createUser(form);
      setShowCreate(false);
      setForm({ username: '', email: '', password: '', role: 'attendant' });
      load();
    } catch (err: any) {
      setCreateError(err.message || 'Erro ao criar usuário');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resettingUser || !newPassword) return;
    setResetError('');
    setResetSuccess('');
    setResetLoading(true);
    try {
      await authApi.resetPassword(resettingUser.id, newPassword);
      setResetSuccess(`Senha de ${resettingUser.username} foi resetada! O usuário deverá trocá-la no próximo login.`);
      setTimeout(() => {
        setResettingUser(null);
        setNewPassword('');
        setResetSuccess('');
        load();
      }, 1500);
    } catch (err: any) {
      setResetError(err.message || 'Erro ao resetar senha');
    } finally {
      setResetLoading(false);
    }
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
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="section-title">Atendentes e Usuários</h2>
          <p className="text-xs sm:text-sm text-monte-sereno mt-1">
            Gerencie atendentes, funções e permissões de acesso ao sistema
          </p>
        </div>
        {user?.role === 'admin' && (
          <button
            onClick={() => { setCreateError(''); setForm({ username: '', email: '', password: '', role: 'attendant' }); setShowCreate(true); }}
            className="btn-primary flex items-center justify-center gap-2 text-sm py-2.5 px-4 self-start sm:self-auto shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Usuário</span>
          </button>
        )}
      </div>

      {/* Main Container - Card View on Mobile, Table View on Desktop */}
      <div className="card-static overflow-hidden">
        {/* Mobile View (Cards) */}
        <div className="block md:hidden divide-y divide-monte-sereno/10">
          {users.map(u => (
            <div key={u.id} className="p-4 space-y-3 hover:bg-monte-areiaSecao/40 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-monte-verde to-monte-azul rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm flex-shrink-0">
                    {u.username[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-monte-azul">{u.username}</h3>
                    <p className="text-xs text-monte-sereno">{u.email}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={u.isActive ? 'badge-green' : 'badge-gray'}>
                    {u.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                  {u.mustChangePassword && (
                    <span className="text-[10px] bg-amber-500/15 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-500/30">
                      Troca pendente
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-monte-sereno pt-1 border-t border-monte-sereno/10">
                <div className="flex items-center gap-1.5">
                  {roleIcon(u.role)}
                  <span className="capitalize font-medium text-monte-azul">{u.role}</span>
                </div>
                <div>
                  {u.role === 'admin' ? (
                    <span className="text-monte-sereno">Todas as contas</span>
                  ) : (
                    <span>{u.whatsappAssignments?.length || 0} conta(s) WhatsApp</span>
                  )}
                </div>
              </div>

              {user?.role === 'admin' && u.id !== user.id && (
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-monte-sereno/10">
                  <button
                    onClick={() => openAssignments(u)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-monte-areiaSecao text-monte-azul hover:bg-monte-verde/15 hover:text-monte-verde transition-colors font-medium"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Contas
                  </button>
                  <button
                    onClick={() => { setResettingUser(u); setNewPassword(''); setResetError(''); setResetSuccess(''); }}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors font-medium"
                    title="Resetar Senha"
                  >
                    <Key className="w-3.5 h-3.5" /> Senha
                  </button>
                  <button
                    onClick={() => handleDelete(u.id)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium"
                    title="Excluir Usuário"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Rem
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-monte-areiaSecao/60 border-b border-monte-sereno/15">
              <tr>
                <th className="table-header">Usuário</th>
                <th className="table-header">Email</th>
                <th className="table-header">Função</th>
                <th className="table-header">Status</th>
                <th className="table-header">WhatsApps</th>
                <th className="table-header text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-monte-sereno/10">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-monte-areiaSecao/40 transition-colors">
                  <td className="table-row">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gradient-to-br from-monte-verde to-monte-azul rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs">
                        {u.username[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-semibold text-monte-azul">{u.username}</span>
                    </div>
                  </td>
                  <td className="table-row text-monte-sereno text-sm">{u.email}</td>
                  <td className="table-row">
                    <div className="flex items-center gap-1.5">
                      {roleIcon(u.role)}
                      <span className="text-sm capitalize font-medium text-monte-azul">{u.role}</span>
                    </div>
                  </td>
                  <td className="table-row">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={u.isActive ? 'badge-green' : 'badge-gray'}>
                        {u.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                      {u.mustChangePassword && (
                        <span className="text-[10px] bg-amber-500/15 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-500/30">
                          Troca pendente
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="table-row">
                    {u.role === 'admin' ? (
                      <span className="text-xs text-monte-sereno">Todas</span>
                    ) : (
                      <span className="text-xs text-monte-sereno">{u.whatsappAssignments?.length || 0} atribuída(s)</span>
                    )}
                  </td>
                  <td className="table-row text-right">
                    {user?.role === 'admin' && u.id !== user.id && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openAssignments(u)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-monte-areiaSecao text-monte-azul hover:bg-monte-verde/15 hover:text-monte-verde transition-colors font-medium"
                        >
                          <Smartphone className="w-3.5 h-3.5" /> Contas
                        </button>
                        <button
                          onClick={() => { setResettingUser(u); setNewPassword(''); setResetError(''); setResetSuccess(''); }}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors font-medium"
                          title="Resetar Senha"
                        >
                          <Key className="w-3.5 h-3.5" /> Resetar Senha
                        </button>
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="p-1.5 rounded-lg text-monte-sereno hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Remover Usuário"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Novo Usuário (Responsivo) */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-monte-azul/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-3xl sm:rounded-4xl p-6 sm:p-8 w-full max-w-md my-auto shadow-2xl border border-monte-sereno/10 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold font-display text-monte-azul">Novo Usuário</h3>
              <button onClick={() => setShowCreate(false)} className="text-monte-sereno hover:text-monte-azul text-sm font-semibold">✕</button>
            </div>
            
            {createError && (
              <div className="bg-monte-terracota/15 border border-monte-terracota/30 text-monte-terracota px-4 py-3 rounded-2xl text-xs sm:text-sm mb-4">
                {createError}
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-monte-azul uppercase tracking-wider mb-1">Nome de Usuário</label>
                <input
                  type="text"
                  className="input text-sm"
                  placeholder="ex: joao"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-monte-azul uppercase tracking-wider mb-1">Email</label>
                <input
                  type="email"
                  className="input text-sm"
                  placeholder="ex: joao@email.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-monte-azul uppercase tracking-wider mb-1">Senha Inicial</label>
                <input
                  type="password"
                  className="input text-sm"
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                />
                <p className="text-[11px] text-monte-sereno mt-1">
                  O usuário será solicitado a trocar essa senha no primeiro acesso.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-monte-azul uppercase tracking-wider mb-1">Função / Permissão</label>
                <select className="input text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="attendant">Atendente</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1 py-2.5 text-sm">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={createLoading || !form.username || !form.email || !form.password}
                  className="btn-primary flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                >
                  {createLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Criar Usuário'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Resetar Senha (Admin) */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 bg-monte-azul/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setResettingUser(null)}>
          <div className="bg-white rounded-3xl sm:rounded-4xl p-6 sm:p-8 w-full max-w-md my-auto shadow-2xl border border-monte-sereno/10 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-500/10 text-amber-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-display text-monte-azul">Resetar Senha</h3>
                <p className="text-xs text-monte-sereno">Usuário: <strong className="text-monte-azul">{resettingUser.username}</strong></p>
              </div>
            </div>

            {resetError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 px-4 py-3 rounded-2xl text-xs sm:text-sm mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            {resetSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-4 py-3 rounded-2xl text-xs sm:text-sm mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{resetSuccess}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-monte-azul uppercase tracking-wider mb-1">Nova Senha Provisória</label>
                <input
                  type="text"
                  className="input text-sm font-mono"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoFocus
                />
                <p className="text-[11px] text-monte-sereno mt-1">
                  Ao resetar, o usuário precisará obrigatoriamente criar uma nova senha ao fazer login.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResettingUser(null)}
                  className="btn-secondary flex-1 py-2.5 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetLoading || !newPassword || newPassword.length < 6}
                  className="btn-primary flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {resetLoading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      Resetar Senha
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Atribuição de Contas WhatsApp */}
      {assigningUser && (
        <div className="fixed inset-0 z-50 bg-monte-azul/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setAssigningUser(null)}>
          <div className="bg-white rounded-3xl sm:rounded-4xl p-6 sm:p-8 w-full max-w-md my-auto shadow-2xl border border-monte-sereno/10 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold font-display text-monte-azul mb-1">Contas de {assigningUser.username}</h3>
            <p className="text-xs sm:text-sm text-monte-sereno mb-5">
              Marque as contas WhatsApp que este atendente terá acesso.
            </p>
            
            <div className="space-y-2 max-h-60 overflow-y-auto p-1">
              {accounts.length === 0 ? (
                <p className="text-xs text-monte-sereno py-4 text-center">Nenhuma conta WhatsApp cadastrada.</p>
              ) : (
                accounts.map(account => (
                  <label key={account.id} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-monte-areiaSecao cursor-pointer border border-monte-sereno/10 transition-colors">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-monte-sereno/30 text-monte-verde focus:ring-monte-verde cursor-pointer"
                      checked={assignedIds.includes(account.id)}
                      onChange={e => setAssignedIds(prev => e.target.checked ? [...prev, account.id] : prev.filter(id => id !== account.id))}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-monte-azul truncate">{account.name}</p>
                      {account.phone && <p className="text-xs text-monte-sereno">{account.phone}</p>}
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setAssigningUser(null)} className="btn-secondary flex-1 py-2.5 text-sm">Cancelar</button>
              <button
                onClick={saveAssignments}
                disabled={assignLoading}
                className="btn-primary flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
              >
                {assignLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
