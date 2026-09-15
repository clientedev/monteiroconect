import { useState, useEffect, useMemo } from 'react';
import { authApi, whatsappApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  Users, Plus, Trash2, Shield, Eye, UserCheck, Key, Smartphone,
  Lock, AlertCircle, CheckCircle2, Search, Filter, Check, X,
  UserPlus, Mail, ShieldAlert, Sparkles, CheckSquare, Square
} from 'lucide-react';

export default function AttendantsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'attendant' });
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'supervisor' | 'attendant'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

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
    try {
      setUsers(await authApi.listUsers());
    } catch (e) {
      console.error('Erro ao listar usuários', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (user?.role === 'admin') {
      whatsappApi.list().then(setAccounts).catch(() => {});
    }
  }, [user?.role]);

  // Metrics calculation
  const metrics = useMemo(() => {
    const total = users.length;
    const active = users.filter(u => u.isActive).length;
    const attendants = users.filter(u => u.role === 'attendant').length;
    const supervisors = users.filter(u => u.role === 'supervisor').length;
    const admins = users.filter(u => u.role === 'admin').length;
    return { total, active, attendants, supervisors, admins };
  }, [users]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchSearch =
        !searchQuery.trim() ||
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && u.isActive) ||
        (statusFilter === 'inactive' && !u.isActive);

      return matchSearch && matchRole && matchStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

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
      await load();
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
      await load();
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
      setResetSuccess(`Senha de ${resettingUser.username} foi redefinida com sucesso!`);
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

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await authApi.deleteUser(id);
      load();
    } catch (err: any) {
      alert(err.message || 'Erro ao remover usuário');
    }
  };

  const toggleShowInSendAs = async (u: any) => {
    try {
      const newValue = u.showInSendAs === false ? true : false;
      await authApi.updateUser(u.id, { showInSendAs: newValue });
      load();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar configuração de exibição');
    }
  };

  const roleDetails = (role: string) => {
    switch (role) {
      case 'admin':
        return {
          label: 'Administrador',
          icon: Shield,
          color: 'text-monte-terracota',
          bg: 'bg-monte-terracota/10 border-monte-terracota/20 text-monte-terracota',
          description: 'Acesso total a todas as configurações e WhatsApps',
        };
      case 'supervisor':
        return {
          label: 'Supervisor',
          icon: Eye,
          color: 'text-sky-600',
          bg: 'bg-sky-50 border-sky-200 text-sky-700',
          description: 'Supervisão de conversas, métricas e relatórios',
        };
      default:
        return {
          label: 'Atendente',
          icon: UserCheck,
          color: 'text-emerald-600',
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
          description: 'Atendimento direto aos clientes nas contas atribuídas',
        };
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="section-title text-2xl">Atendentes e Usuários</h2>
            <span className="badge badge-blue text-xs font-semibold">{users.length} cadastrados</span>
          </div>
          <p className="text-xs sm:text-sm text-monte-sereno mt-1">
            Gerencie o time de atendimento, permissões de acesso e contas de WhatsApp vinculadas
          </p>
        </div>

        {user?.role === 'admin' && (
          <button
            onClick={() => {
              setCreateError('');
              setForm({ username: '', email: '', password: '', role: 'attendant' });
              setShowCreate(true);
            }}
            className="btn-primary flex items-center justify-center gap-2 text-sm py-2.5 px-5 self-start sm:self-auto shadow-md hover:shadow-lg transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Usuário</span>
          </button>
        )}
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Users */}
        <div className="card-static p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-2xl bg-monte-verde/10 text-monte-verde flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-monte-sereno uppercase tracking-wider">Total de Usuários</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold font-display text-monte-azul">{metrics.total}</span>
              <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                {metrics.active} ativos
              </span>
            </div>
          </div>
        </div>

        {/* Attendants */}
        <div className="card-static p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-monte-sereno uppercase tracking-wider">Atendentes</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold font-display text-monte-azul">{metrics.attendants}</span>
              <span className="text-[11px] text-monte-sereno">Operacional</span>
            </div>
          </div>
        </div>

        {/* Supervisors */}
        <div className="card-static p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-600 flex items-center justify-center flex-shrink-0">
            <Eye className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-monte-sereno uppercase tracking-wider">Supervisores</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold font-display text-monte-azul">{metrics.supervisors}</span>
              <span className="text-[11px] text-monte-sereno">Supervisão</span>
            </div>
          </div>
        </div>

        {/* Admins */}
        <div className="card-static p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-2xl bg-monte-terracota/10 text-monte-terracota flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-monte-sereno uppercase tracking-wider">Administradores</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold font-display text-monte-azul">{metrics.admins}</span>
              <span className="text-[11px] text-monte-sereno">Gestão Total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card-static p-3 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno" />
          <input
            type="text"
            placeholder="Buscar por nome ou email do usuário..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-monte-areiaSecao/80 hover:bg-white focus:bg-white border border-monte-sereno/20 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-monte-verde/20 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-monte-sereno hover:text-monte-azul"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Role Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
              roleFilter === 'all'
                ? 'bg-monte-verde text-white shadow-xs'
                : 'text-monte-sereno hover:text-monte-azul hover:bg-monte-areiaSecao'
            }`}
          >
            Todos ({metrics.total})
          </button>
          <button
            onClick={() => setRoleFilter('attendant')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
              roleFilter === 'attendant'
                ? 'bg-monte-verde text-white shadow-xs'
                : 'text-monte-sereno hover:text-monte-azul hover:bg-monte-areiaSecao'
            }`}
          >
            Atendentes ({metrics.attendants})
          </button>
          <button
            onClick={() => setRoleFilter('supervisor')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
              roleFilter === 'supervisor'
                ? 'bg-monte-verde text-white shadow-xs'
                : 'text-monte-sereno hover:text-monte-azul hover:bg-monte-areiaSecao'
            }`}
          >
            Supervisores ({metrics.supervisors})
          </button>
          <button
            onClick={() => setRoleFilter('admin')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
              roleFilter === 'admin'
                ? 'bg-monte-verde text-white shadow-xs'
                : 'text-monte-sereno hover:text-monte-azul hover:bg-monte-areiaSecao'
            }`}
          >
            Admins ({metrics.admins})
          </button>
        </div>
      </div>

      {/* Users List Container */}
      <div className="card-static overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-monte-sereno">
            <div className="w-8 h-8 border-3 border-monte-verde border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Carregando usuários...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-16 text-center text-monte-sereno px-4">
            <Users className="w-12 h-12 mx-auto mb-3 text-monte-sereno/30" />
            <p className="text-base font-bold text-monte-azul font-display">Nenhum usuário encontrado</p>
            <p className="text-xs text-monte-sereno/80 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? `Nenhum resultado para "${searchQuery}". Experimente alterar o termo de busca.`
                : 'Nenhum usuário cadastrado com estes filtros.'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile View (Cards) */}
            <div className="block md:hidden divide-y divide-monte-sereno/10">
              {filteredUsers.map(u => {
                const roleInfo = roleDetails(u.role);
                const RoleIcon = roleInfo.icon;
                const assignedCount = u.whatsappAssignments?.length || 0;

                return (
                  <div key={u.id} className="p-4 space-y-3.5 hover:bg-monte-areiaSecao/40 transition-colors">
                    {/* User Info Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <div className="w-11 h-11 bg-gradient-to-br from-monte-verde to-monte-azul rounded-2xl flex items-center justify-center text-base font-bold text-white shadow-xs flex-shrink-0">
                            {u.username[0].toUpperCase()}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                              u.isActive ? 'bg-emerald-500' : 'bg-gray-400'
                            }`}
                            title={u.isActive ? 'Usuário Ativo' : 'Usuário Inativo'}
                          />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-monte-azul truncate flex items-center gap-1.5">
                            {u.username}
                            {u.id === user?.id && (
                              <span className="text-[10px] bg-monte-verde/15 text-monte-verde px-1.5 py-0.2 rounded font-semibold">
                                Você
                              </span>
                            )}
                          </h3>
                          <p className="text-xs text-monte-sereno truncate">{u.email}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${roleInfo.bg}`}>
                          <RoleIcon className="w-3 h-3" />
                          {roleInfo.label}
                        </span>
                        {u.mustChangePassword && (
                          <span className="text-[10px] bg-amber-500/15 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-500/30 flex items-center gap-1">
                            <Key className="w-2.5 h-2.5" /> Troca pendente
                          </span>
                        )}
                      </div>
                    </div>

                    {/* WhatsApp Accounts Assigned */}
                    <div className="bg-monte-areiaSecao/60 rounded-xl p-2.5 text-xs">
                      <p className="text-[10px] font-semibold text-monte-sereno uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Smartphone className="w-3 h-3" /> WhatsApps Vinculados:
                      </p>
                      {u.role === 'admin' ? (
                        <span className="text-xs font-medium text-monte-verde">Acesso total a todas as contas</span>
                      ) : assignedCount > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {u.whatsappAssignments.map((a: any) => (
                            <span key={a.whatsappId} className="bg-white border border-monte-sereno/20 text-monte-azul px-2 py-0.5 rounded-lg text-[11px] font-medium">
                              {a.whatsapp?.name || 'WhatsApp'}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-monte-sereno/70 italic">Nenhum WhatsApp atribuído</span>
                      )}
                    </div>

                    {/* Actions */}
                    {user?.role === 'admin' && u.id !== user.id && (
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-monte-sereno/10">
                        <button
                          onClick={() => openAssignments(u)}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-monte-areiaSecao text-monte-azul hover:bg-monte-verde/15 hover:text-monte-verde transition-colors font-medium border border-monte-sereno/20"
                        >
                          <Smartphone className="w-3.5 h-3.5" /> WhatsApps
                        </button>
                        <button
                          onClick={() => {
                            setResettingUser(u);
                            setNewPassword('');
                            setResetError('');
                            setResetSuccess('');
                          }}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors font-medium border border-amber-200"
                        >
                          <Key className="w-3.5 h-3.5" /> Senha
                        </button>
                        <button
                          onClick={() => toggleShowInSendAs(u)}
                          className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl transition-colors font-medium border ${u.showInSendAs !== false ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200'}`}
                          title={u.showInSendAs !== false ? 'Ocultar do Enviar Como' : 'Mostrar no Enviar Como'}
                        >
                          {u.showInSendAs !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          Visível
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.username)}
                          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-medium border border-red-200"
                          title="Remover Usuário"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop View (Table) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-monte-areiaSecao/70 border-b border-monte-sereno/15">
                  <tr>
                    <th className="px-6 py-3.5 text-xs font-semibold text-monte-azul uppercase tracking-wider">Usuário</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-monte-azul uppercase tracking-wider">Função</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-monte-azul uppercase tracking-wider">Status & Segurança</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-monte-azul uppercase tracking-wider">WhatsApps Atribuídos</th>
                    <th className="px-6 py-3.5 text-xs font-semibold text-monte-azul uppercase tracking-wider text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-monte-sereno/10">
                  {filteredUsers.map(u => {
                    const roleInfo = roleDetails(u.role);
                    const RoleIcon = roleInfo.icon;
                    const assignedCount = u.whatsappAssignments?.length || 0;

                    return (
                      <tr key={u.id} className="hover:bg-monte-areiaSecao/40 transition-colors">
                        {/* User Cell */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative flex-shrink-0">
                              <div className="w-10 h-10 bg-gradient-to-br from-monte-verde to-monte-azul rounded-2xl flex items-center justify-center text-sm font-bold text-white shadow-xs">
                                {u.username[0].toUpperCase()}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                                  u.isActive ? 'bg-emerald-500' : 'bg-gray-400'
                                }`}
                                title={u.isActive ? 'Ativo' : 'Inativo'}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-monte-azul truncate">{u.username}</span>
                                {u.id === user?.id && (
                                  <span className="text-[10px] bg-monte-verde/15 text-monte-verde px-1.5 py-0.2 rounded font-semibold">
                                    Você
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-monte-sereno truncate block">{u.email}</span>
                            </div>
                          </div>
                        </td>

                        {/* Role Cell */}
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${roleInfo.bg}`}>
                            <RoleIcon className="w-3.5 h-3.5" />
                            {roleInfo.label}
                          </span>
                        </td>

                        {/* Status & Security Cell */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={u.isActive ? 'badge-green' : 'badge-gray'}>
                              {u.isActive ? 'Ativo' : 'Inativo'}
                            </span>
                            {u.mustChangePassword && (
                              <span className="text-[10px] bg-amber-500/15 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-500/30 flex items-center gap-1">
                                <Key className="w-2.5 h-2.5" /> Troca de senha pendente
                              </span>
                            )}
                          </div>
                        </td>

                        {/* WhatsApp Assignments Cell */}
                        <td className="px-6 py-4">
                          {u.role === 'admin' ? (
                            <div className="flex items-center gap-1.5 text-xs text-monte-verde font-semibold bg-monte-verde/10 px-2.5 py-1 rounded-full w-fit">
                              <Shield className="w-3.5 h-3.5" />
                              <span>Todas as contas</span>
                            </div>
                          ) : assignedCount > 0 ? (
                            <div className="flex flex-wrap gap-1.5 max-w-xs">
                              {u.whatsappAssignments.map((a: any) => (
                                <span
                                  key={a.whatsappId}
                                  className="inline-flex items-center gap-1 bg-white border border-monte-sereno/20 text-monte-azul px-2.5 py-0.5 rounded-lg text-xs font-medium shadow-2xs"
                                >
                                  <Smartphone className="w-3 h-3 text-monte-sereno" />
                                  {a.whatsapp?.name || 'WhatsApp'}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200/60 px-2.5 py-1 rounded-full inline-block">
                              Nenhuma conta vinculada
                            </span>
                          )}
                        </td>

                        {/* Actions Cell */}
                        <td className="px-6 py-4 text-right">
                          {user?.role === 'admin' && u.id !== user.id && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openAssignments(u)}
                                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl bg-monte-areiaSecao text-monte-azul hover:bg-monte-verde/15 hover:text-monte-verde transition-colors font-medium border border-monte-sereno/15"
                                title="Vincular contas de WhatsApp"
                              >
                                <Smartphone className="w-3.5 h-3.5" /> Contas
                              </button>
                              <button
                                onClick={() => {
                                  setResettingUser(u);
                                  setNewPassword('');
                                  setResetError('');
                                  setResetSuccess('');
                                }}
                                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors font-medium border border-amber-200"
                                title="Resetar Senha do Usuário"
                              >
                                <Key className="w-3.5 h-3.5" /> Senha
                              </button>
                              <button
                                onClick={() => toggleShowInSendAs(u)}
                                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl transition-colors font-medium border ${u.showInSendAs !== false ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-gray-200'}`}
                                title={u.showInSendAs !== false ? 'Ocultar do Enviar Como' : 'Mostrar no Enviar Como'}
                              >
                                {u.showInSendAs !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={() => handleDelete(u.id, u.username)}
                                className="p-1.5 rounded-xl text-monte-sereno hover:bg-red-50 hover:text-red-600 transition-colors border border-transparent hover:border-red-200"
                                title="Remover Usuário"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal: Novo Usuário */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-monte-azul/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-4xl p-6 sm:p-8 w-full max-w-lg my-auto shadow-2xl border border-monte-sereno/15 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-4 border-b border-monte-sereno/15 mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-monte-verde/10 text-monte-verde flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-monte-azul">Cadastrar Novo Usuário</h3>
                  <p className="text-xs text-monte-sereno">Crie o acesso para um novo atendente ou administrador</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 text-monte-sereno hover:text-monte-azul rounded-full hover:bg-monte-areiaSecao transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {createError && (
              <div className="bg-monte-terracota/10 border border-monte-terracota/25 text-monte-terracota px-4 py-3 rounded-2xl text-xs sm:text-sm mb-5 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{createError}</span>
              </div>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-monte-azul uppercase tracking-wider mb-1.5">
                  Nome do Usuário
                </label>
                <input
                  type="text"
                  className="input text-sm"
                  placeholder="Ex: joao.silva"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-monte-azul uppercase tracking-wider mb-1.5">
                  Email de Acesso
                </label>
                <input
                  type="email"
                  className="input text-sm"
                  placeholder="Ex: joao@monteiroconect.com.br"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-monte-azul uppercase tracking-wider mb-1.5">
                  Senha Provisória
                </label>
                <input
                  type="password"
                  className="input text-sm"
                  placeholder="Mínimo 6 caracteres"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                />
                <p className="text-[11px] text-monte-sereno mt-1.5 flex items-center gap-1">
                  <Key className="w-3 h-3 text-monte-verde" />
                  O usuário será solicitado a definir uma nova senha pessoal no primeiro login.
                </p>
              </div>

              {/* Role Selection Cards */}
              <div>
                <label className="block text-xs font-bold text-monte-azul uppercase tracking-wider mb-2">
                  Função e Nível de Acesso
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Attendant Option */}
                  <div
                    onClick={() => setForm({ ...form, role: 'attendant' })}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      form.role === 'attendant'
                        ? 'border-monte-verde bg-monte-verde/5 shadow-xs ring-2 ring-monte-verde/20'
                        : 'border-monte-sereno/20 hover:border-monte-sereno/40 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <UserCheck className={`w-4 h-4 ${form.role === 'attendant' ? 'text-monte-verde' : 'text-monte-sereno'}`} />
                      <span className="text-xs font-bold text-monte-azul">Atendente</span>
                    </div>
                    <p className="text-[11px] text-monte-sereno leading-tight">
                      Atende conversas apenas dos WhatsApps autorizados.
                    </p>
                  </div>

                  {/* Supervisor Option */}
                  <div
                    onClick={() => setForm({ ...form, role: 'supervisor' })}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      form.role === 'supervisor'
                        ? 'border-sky-500 bg-sky-50/50 shadow-xs ring-2 ring-sky-500/20'
                        : 'border-monte-sereno/20 hover:border-monte-sereno/40 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Eye className={`w-4 h-4 ${form.role === 'supervisor' ? 'text-sky-600' : 'text-monte-sereno'}`} />
                      <span className="text-xs font-bold text-monte-azul">Supervisor</span>
                    </div>
                    <p className="text-[11px] text-monte-sereno leading-tight">
                      Monitora métricas, conversas e equipe.
                    </p>
                  </div>

                  {/* Admin Option */}
                  <div
                    onClick={() => setForm({ ...form, role: 'admin' })}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                      form.role === 'admin'
                        ? 'border-monte-terracota bg-monte-terracota/5 shadow-xs ring-2 ring-monte-terracota/20'
                        : 'border-monte-sereno/20 hover:border-monte-sereno/40 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Shield className={`w-4 h-4 ${form.role === 'admin' ? 'text-monte-terracota' : 'text-monte-sereno'}`} />
                      <span className="text-xs font-bold text-monte-azul">Admin</span>
                    </div>
                    <p className="text-[11px] text-monte-sereno leading-tight">
                      Acesso total ao sistema e todas as contas.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
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
          <div className="bg-white rounded-4xl p-6 sm:p-8 w-full max-w-md my-auto shadow-2xl border border-monte-sereno/15 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-monte-sereno/15">
              <div className="w-10 h-10 bg-amber-500/10 text-amber-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-display text-monte-azul">Redefinir Senha</h3>
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
                <label className="block text-xs font-bold text-monte-azul uppercase tracking-wider mb-1.5">
                  Nova Senha Provisória
                </label>
                <input
                  type="text"
                  className="input text-sm font-mono"
                  placeholder="Mínimo 6 caracteres (ex: Monteiro2026)"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoFocus
                />
                <p className="text-[11px] text-monte-sereno mt-1.5">
                  Ao redefinir, o usuário terá que cadastrar uma nova senha pessoal no próximo login.
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
                      Salvar Nova Senha
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
          <div className="bg-white rounded-4xl p-6 sm:p-8 w-full max-w-lg my-auto shadow-2xl border border-monte-sereno/15 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-4 border-b border-monte-sereno/15 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-monte-verde/10 text-monte-verde flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display text-monte-azul">WhatsApps de {assigningUser.username}</h3>
                  <p className="text-xs text-monte-sereno">Selecione quais contas este atendente poderá visualizar e responder</p>
                </div>
              </div>
              <button
                onClick={() => setAssigningUser(null)}
                className="p-1 text-monte-sereno hover:text-monte-azul rounded-full hover:bg-monte-areiaSecao transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions */}
            {accounts.length > 0 && (
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-monte-sereno/10 text-xs">
                <span className="text-monte-sereno">{assignedIds.length} de {accounts.length} contas selecionadas</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignedIds(accounts.map(a => a.id))}
                    className="text-monte-verde hover:underline font-semibold"
                  >
                    Marcar Todas
                  </button>
                  <span className="text-monte-sereno/40">·</span>
                  <button
                    type="button"
                    onClick={() => setAssignedIds([])}
                    className="text-monte-sereno hover:text-monte-azul hover:underline"
                  >
                    Desmarcar Todas
                  </button>
                </div>
              </div>
            )}
            
            <div className="space-y-2.5 max-h-72 overflow-y-auto p-1">
              {accounts.length === 0 ? (
                <div className="py-8 text-center text-monte-sereno">
                  <Smartphone className="w-8 h-8 mx-auto mb-2 text-monte-sereno/40" />
                  <p className="text-xs">Nenhuma conta WhatsApp cadastrada no sistema.</p>
                </div>
              ) : (
                accounts.map(account => {
                  const isChecked = assignedIds.includes(account.id);
                  const isConnected = account.status === 'CONNECTED';

                  return (
                    <label
                      key={account.id}
                      className={`flex items-center gap-3 p-3.5 rounded-2xl cursor-pointer border transition-all ${
                        isChecked
                          ? 'border-monte-verde bg-monte-verde/5 shadow-2xs'
                          : 'border-monte-sereno/15 hover:bg-monte-areiaSecao/60 bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-monte-sereno/30 text-monte-verde focus:ring-monte-verde cursor-pointer"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setAssignedIds(prev => [...prev, account.id]);
                          } else {
                            setAssignedIds(prev => prev.filter(id => id !== account.id));
                          }
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-monte-azul truncate">{account.name}</p>
                          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-gray-300'}`} title={isConnected ? 'Conectado' : 'Desconectado'} />
                        </div>
                        {account.phone && <p className="text-xs text-monte-sereno">{account.phone}</p>}
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex gap-3 mt-6 pt-3 border-t border-monte-sereno/15">
              <button onClick={() => setAssigningUser(null)} className="btn-secondary flex-1 py-2.5 text-sm">
                Cancelar
              </button>
              <button
                onClick={saveAssignments}
                disabled={assignLoading}
                className="btn-primary flex-1 py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
              >
                {assignLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Salvar Permissões'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
