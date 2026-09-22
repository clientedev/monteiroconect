import { useState, useEffect, useMemo, useCallback } from 'react';
import { quickMessageApi, authApi, type QuickMessage } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  MessageSquareQuote, Search, Plus, Edit2, Trash2, Copy, Check,
  Sparkles, Tag, AlertCircle, X, HelpCircle, CornerDownLeft,
  Users, User, LayoutGrid, Columns3, CopyPlus, ArrowRight,
  Shield, CheckCircle2, Move
} from 'lucide-react';

interface AttendantUser {
  id: string;
  username: string;
  email?: string;
  role: string;
  isActive?: boolean;
}

export default function QuickMessagesPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [attendants, setAttendants] = useState<AttendantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedAttendantFilter, setSelectedAttendantFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'board' | 'grid'>('board');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Drag & Drop State
  const [draggedMsgId, setDraggedMsgId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<QuickMessage | null>(null);
  const [shortcut, setShortcut] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [assignedUserId, setAssignedUserId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete Confirmation Modal State
  const [deletingMessage, setDeletingMessage] = useState<QuickMessage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [messagesData, usersData] = await Promise.all([
        quickMessageApi.list(),
        authApi.listUsers().catch(() => []),
      ]);
      setMessages(messagesData);
      setAttendants(usersData.filter((u: any) => u.isActive !== false));
    } catch (err: any) {
      console.error('Erro ao carregar mensagens rápidas e atendentes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    messages.forEach(m => {
      if (m.category && m.category.trim()) {
        set.add(m.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [messages]);

  const filteredMessages = useMemo(() => {
    return messages.filter(m => {
      const matchCategory = selectedCategory === 'all' || m.category === selectedCategory;
      if (!matchCategory) return false;

      if (selectedAttendantFilter !== 'all') {
        if (selectedAttendantFilter === 'general') {
          if (m.userId) return false;
        } else {
          if (m.userId !== selectedAttendantFilter) return false;
        }
      }

      if (!search.trim()) return true;
      const q = search.toLowerCase().trim().replace(/^\/+/, '');
      const matchShortcut = m.shortcut.toLowerCase().includes(q);
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchContent = m.content.toLowerCase().includes(q);
      const matchOwner = m.user?.username.toLowerCase().includes(q);
      return matchShortcut || matchTitle || matchContent || Boolean(matchOwner);
    });
  }, [messages, search, selectedCategory, selectedAttendantFilter]);

  // Colunas do Kanban: Coluna 1 = Geral (userId: null), Colunas 2..N = Atendentes
  const boardColumns = useMemo(() => {
    const cols = [
      {
        id: 'general',
        userId: null as string | null,
        name: 'Gerais (Toda a Equipe)',
        subtitle: 'Disponível para todos os atendentes',
        isGeneral: true,
        isCurrentUser: false,
      },
      ...attendants.map(att => ({
        id: att.id,
        userId: att.id as string | null,
        name: att.username,
        subtitle: att.role === 'admin' ? 'Administrador' : att.role === 'supervisor' ? 'Supervisor' : 'Atendente',
        isGeneral: false,
        isCurrentUser: att.id === user?.id,
      })),
    ];
    return cols;
  }, [attendants, user?.id]);

  const handleOpenCreateModal = (targetUserId?: string | null) => {
    setEditingMessage(null);
    setShortcut('');
    setTitle('');
    setContent('');
    setCategory('');
    setAssignedUserId(targetUserId !== undefined ? (targetUserId || '') : (user?.id || ''));
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (msg: QuickMessage) => {
    setEditingMessage(msg);
    setShortcut(msg.shortcut);
    setTitle(msg.title);
    setContent(msg.content);
    setCategory(msg.category || '');
    setAssignedUserId(msg.userId || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanShortcut = shortcut.trim().toLowerCase().replace(/^\/+/, '').replace(/\s+/g, '-');
    if (!cleanShortcut) {
      setFormError('Informe um atalho válido (ex: pix, ola, obrigado)');
      return;
    }
    if (!title.trim()) {
      setFormError('Informe um título para identificar a mensagem');
      return;
    }
    if (!content.trim()) {
      setFormError('Informe o conteúdo da mensagem');
      return;
    }

    try {
      setSaving(true);
      const payloadUserId = assignedUserId ? assignedUserId : null;

      if (editingMessage) {
        await quickMessageApi.update(editingMessage.id, {
          title: title.trim(),
          shortcut: cleanShortcut,
          content: content.trim(),
          category: category.trim() || null,
          userId: payloadUserId,
        });
      } else {
        await quickMessageApi.create({
          title: title.trim(),
          shortcut: cleanShortcut,
          content: content.trim(),
          category: category.trim() || null,
          userId: payloadUserId,
        });
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar mensagem rápida');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingMessage) return;
    try {
      setDeleting(true);
      await quickMessageApi.delete(deletingMessage.id);
      setDeletingMessage(null);
      await loadData();
    } catch (err: any) {
      alert('Erro ao excluir mensagem rápida: ' + (err.message || 'tente novamente'));
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = (msg: QuickMessage) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Clonar para mim (ou para o usuário logado)
  const handleCloneToMe = async (msg: QuickMessage) => {
    try {
      setCloningId(msg.id);
      const cloned = await quickMessageApi.clone(msg.id, user?.id);
      setToastMessage(`Mensagem "/${cloned.shortcut}" clonada com sucesso para você!`);
      setTimeout(() => setToastMessage(null), 3500);
      await loadData();
    } catch (err: any) {
      alert('Erro ao clonar mensagem: ' + (err.message || 'tente novamente'));
    } finally {
      setCloningId(null);
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, msg: QuickMessage) => {
    e.dataTransfer.setData('text/plain', msg.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedMsgId(msg.id);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColId !== colId) {
      setDragOverColId(colId);
    }
  };

  const handleDragLeave = () => {
    setDragOverColId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    setDragOverColId(null);
    const msgId = e.dataTransfer.getData('text/plain') || draggedMsgId;
    setDraggedMsgId(null);
    if (!msgId) return;

    const targetUserId = targetColId === 'general' ? null : targetColId;
    const currentMsg = messages.find(m => m.id === msgId);

    // Se já estiver na mesma coluna, ignora
    const currentUserId = currentMsg?.userId || null;
    if (currentUserId === targetUserId) return;

    // Atualização otimista
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, userId: targetUserId } : m));

    try {
      await quickMessageApi.assign(msgId, targetUserId);
      const destName = targetUserId ? (attendants.find(a => a.id === targetUserId)?.username || 'Atendente') : 'Gerais';
      setToastMessage(`Mensagem reatribuída para ${destName} com sucesso!`);
      setTimeout(() => setToastMessage(null), 3000);
      await loadData();
    } catch (err: any) {
      alert('Erro ao reatribuir mensagem: ' + (err.message || 'tente novamente'));
      await loadData();
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast de Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-monte-azul text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-white/20 animate-slideUp">
          <CheckCircle2 className="w-5 h-5 text-monte-verde shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-white/60 hover:text-white ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Banner / Header Executivo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-monte-azul tracking-tight flex items-center gap-2">
              <MessageSquareQuote className="h-7 w-7 text-monte-verde" />
              Mensagens Rápidas por Atendente
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-monte-verde/15 text-monte-verde border border-monte-verde/30">
              {messages.length} cadastradas
            </span>
          </div>
          <p className="text-xs sm:text-sm text-monte-sereno mt-1">
            Organize respostas rápidas por colaborador. <strong>Arraste os cards entre as colunas</strong> para reatribuir e use <strong>"Clonar"</strong> para copiar mensagens para o seu perfil.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Seletor de Modo de Visualização */}
          <div className="p-1 bg-monte-areiaSecao/80 border border-monte-sereno/20 rounded-2xl flex items-center gap-1 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'board'
                  ? 'bg-monte-azul text-white shadow-2xs'
                  : 'text-monte-sereno hover:text-monte-azul'
              }`}
            >
              <Columns3 className="w-4 h-4" />
              <span>Quadro (Arrastar)</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-monte-azul text-white shadow-2xs'
                  : 'text-monte-sereno hover:text-monte-azul'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Lista / Grade</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleOpenCreateModal(user?.id)}
            className="btn-primary inline-flex items-center justify-center gap-2 shadow-sm font-bold text-xs px-4 py-2.5 rounded-2xl cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nova Mensagem
          </button>
        </div>
      </div>

      {/* Info Tips Card */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-monte-verde mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-monte-azul">Como funciona o Quadro de Atendentes?</p>
            <p className="text-slate-600 text-xs mt-0.5 leading-relaxed">
              Cada coluna representa um atendente da equipe (ou as mensagens gerais). Você pode <strong>clicar e arrastar</strong> qualquer card para outra coluna para transferir a quem pertence. Viu uma mensagem útil de outro atendente? Clique em <strong>"Clonar"</strong> para copiá-la para seu próprio uso!
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por atalho (/pix), título, texto ou atendente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-monte-sereno/20 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde transition-colors shadow-2xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filtro de Categoria */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-monte-verde text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todas Categorias
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-monte-verde text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Visualização: QUADRO KANBAN (Arrastar & Soltar por Atendente) */}
      {viewMode === 'board' ? (
        <div className="overflow-x-auto pb-6">
          <div className="flex items-start gap-4 min-w-[760px]">
            {boardColumns.map((col) => {
              const colMessages = filteredMessages.filter(m => {
                if (col.isGeneral) return !m.userId;
                return m.userId === col.userId;
              });
              const isOver = dragOverColId === col.id;

              return (
                <div
                  key={col.id}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.id)}
                  className={`flex-1 min-w-[280px] max-w-[340px] rounded-3xl border transition-all flex flex-col max-h-[78vh] ${
                    isOver
                      ? 'bg-emerald-50/80 border-2 border-dashed border-monte-verde shadow-lg scale-[1.01]'
                      : 'bg-monte-areiaSecao/35 border-monte-sereno/20 shadow-2xs'
                  }`}
                >
                  {/* Cabeçalho da Coluna */}
                  <div className="p-4 border-b border-monte-sereno/15 bg-white rounded-t-3xl flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-2xs ${
                        col.isGeneral
                          ? 'bg-gradient-to-br from-monte-azul to-sky-600'
                          : col.isCurrentUser
                          ? 'bg-gradient-to-br from-monte-verde to-emerald-700 ring-2 ring-monte-verde/30'
                          : 'bg-gradient-to-br from-slate-600 to-slate-800'
                      }`}>
                        {col.isGeneral ? <Users className="w-4 h-4" /> : col.name[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-xs font-bold text-monte-azul truncate">
                            {col.name}
                          </h3>
                          {col.isCurrentUser && (
                            <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                              Você
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-monte-sereno truncate">
                          {col.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-monte-areiaSecao text-monte-azul">
                        {colMessages.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenCreateModal(col.userId)}
                        title={`Nova mensagem para ${col.name}`}
                        className="p-1 rounded-lg text-monte-sereno hover:text-monte-verde hover:bg-monte-areiaSecao/80 transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Lista de Cards da Coluna (Área de Drop) */}
                  <div className="p-3 overflow-y-auto space-y-3 flex-1 min-h-[160px]">
                    {colMessages.map((msg) => {
                      const isDragging = draggedMsgId === msg.id;
                      const isOwner = msg.userId === user?.id;

                      return (
                        <div
                          key={msg.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, msg)}
                          className={`p-3.5 bg-white rounded-2xl border border-monte-sereno/15 shadow-2xs hover:shadow-md hover:border-monte-verde/40 transition-all cursor-grab active:cursor-grabbing group select-none ${
                            isDragging ? 'opacity-40 border-dashed border-monte-verde scale-95' : ''
                          }`}
                        >
                          {/* Card Header: Atalho e Drag Handle */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-emerald-50 text-monte-verde border border-emerald-200">
                                /{msg.shortcut}
                              </span>
                              {msg.category && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600">
                                  <Tag className="h-2.5 w-2.5 text-slate-400" />
                                  {msg.category}
                                </span>
                              )}
                            </div>

                            <div className="text-slate-300 group-hover:text-monte-sereno transition-colors cursor-grab" title="Arraste para outra coluna">
                              <Move className="w-3.5 h-3.5" />
                            </div>
                          </div>

                          {/* Título */}
                          <h4 className="font-bold text-slate-800 text-xs tracking-tight mb-1.5 leading-snug">
                            {msg.title}
                          </h4>

                          {/* Conteúdo preview */}
                          <div className="bg-monte-areiaSecao/40 rounded-xl p-2.5 text-xs text-slate-600 line-clamp-3 leading-relaxed border border-monte-sereno/10">
                            {msg.content}
                          </div>

                          {/* Barra de Ações do Card */}
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                            {/* Botão de Clonagem: destaque se for de outro usuário ou geral */}
                            {!isOwner ? (
                              <button
                                type="button"
                                onClick={() => handleCloneToMe(msg)}
                                disabled={cloningId === msg.id}
                                title="Clonar esta mensagem para o meu perfil"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-monte-verde font-bold text-[11px] border border-emerald-200 transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {cloningId === msg.id ? (
                                  <div className="animate-spin h-3 w-3 border-2 border-monte-verde border-t-transparent rounded-full" />
                                ) : (
                                  <CopyPlus className="w-3 h-3 text-monte-verde" />
                                )}
                                <span>Clonar pra mim</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-monte-verde font-bold flex items-center gap-1">
                                <Check className="w-3 h-3" /> Sua mensagem
                              </span>
                            )}

                            {/* Ações Rápidas: Copiar, Editar, Excluir */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleCopy(msg)}
                                title="Copiar texto"
                                className="p-1 rounded-lg text-slate-400 hover:text-monte-azul hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                {copiedId === msg.id ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(msg)}
                                title="Editar mensagem rápida"
                                className="p-1 rounded-lg text-slate-400 hover:text-monte-azul hover:bg-slate-100 transition-colors cursor-pointer"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => setDeletingMessage(msg)}
                                title="Excluir mensagem rápida"
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {colMessages.length === 0 && (
                      <div className="py-8 text-center text-monte-sereno/70 border border-dashed border-monte-sereno/20 rounded-2xl p-4 space-y-1">
                        <p className="text-xs font-semibold">Nenhuma mensagem aqui</p>
                        <p className="text-[11px]">Arraste um card para atribuir a este atendente.</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Visualização: GRADE TRADICIONAL */
        <div className="space-y-4">
          {/* Filtro rápido por atendente na visão em grade */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-xs font-semibold text-monte-sereno shrink-0 mr-1">Atendente:</span>
            <button
              type="button"
              onClick={() => setSelectedAttendantFilter('all')}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer ${
                selectedAttendantFilter === 'all'
                  ? 'bg-monte-azul text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setSelectedAttendantFilter('general')}
              className={`px-3 py-1 text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer ${
                selectedAttendantFilter === 'general'
                  ? 'bg-monte-azul text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Gerais (Equipe)
            </button>
            {attendants.map(att => (
              <button
                key={att.id}
                type="button"
                onClick={() => setSelectedAttendantFilter(att.id)}
                className={`px-3 py-1 text-xs font-bold rounded-xl transition-colors shrink-0 cursor-pointer ${
                  selectedAttendantFilter === att.id
                    ? 'bg-monte-azul text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {att.username} {att.id === user?.id ? '(Você)' : ''}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredMessages.map((msg) => {
              const isOwner = msg.userId === user?.id;

              return (
                <div
                  key={msg.id}
                  className="bg-white border border-monte-sereno/15 rounded-3xl p-5 shadow-2xs hover:shadow-md hover:border-monte-verde/40 transition-all flex flex-col justify-between group"
                >
                  <div>
                    {/* Header do Card */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-emerald-50 text-monte-verde border border-emerald-200">
                          /{msg.shortcut}
                        </span>
                        {msg.category && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-600">
                            <Tag className="h-2.5 w-2.5 text-slate-400" />
                            {msg.category}
                          </span>
                        )}
                      </div>

                      {/* Dono / Atendente */}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        !msg.userId
                          ? 'bg-blue-50 text-blue-800 border border-blue-200'
                          : isOwner
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        <User className="w-3 h-3" />
                        {msg.user?.username || 'Geral'}
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-800 text-sm tracking-tight mb-2">
                      {msg.title}
                    </h3>

                    <div className="bg-monte-areiaSecao/40 rounded-2xl p-3 text-xs text-slate-600 whitespace-pre-wrap font-sans border border-monte-sereno/10 max-h-36 overflow-y-auto leading-relaxed">
                      {msg.content}
                    </div>
                  </div>

                  {/* Rodapé do Card */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    {!isOwner ? (
                      <button
                        type="button"
                        onClick={() => handleCloneToMe(msg)}
                        disabled={cloningId === msg.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-monte-verde font-bold text-xs border border-emerald-200 transition-colors cursor-pointer"
                      >
                        <CopyPlus className="w-3.5 h-3.5" />
                        <span>Clonar pra mim</span>
                      </button>
                    ) : (
                      <span className="text-xs text-monte-verde font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Sua mensagem
                      </span>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopy(msg)}
                        title="Copiar texto"
                        className="p-1.5 rounded-xl text-slate-500 hover:text-monte-azul hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        {copiedId === msg.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(msg)}
                        title="Editar"
                        className="p-1.5 rounded-xl text-slate-500 hover:text-monte-azul hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingMessage(msg)}
                        title="Excluir"
                        className="p-1.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de Criação / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-monte-azul flex items-center gap-2">
                <MessageSquareQuote className="h-5 w-5 text-monte-verde" />
                {editingMessage ? 'Editar Mensagem Rápida' : 'Nova Mensagem Rápida'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Atribuição de Atendente */}
              <div>
                <label className="block text-xs font-bold text-monte-azul mb-1">
                  Atribuir a quem pertence:
                </label>
                <select
                  value={assignedUserId}
                  onChange={(e) => setAssignedUserId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-xl border border-monte-sereno/20 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde"
                >
                  <option value="">🌐 Geral (Compartilhado com toda a equipe)</option>
                  {attendants.map(att => (
                    <option key={att.id} value={att.id}>
                      👤 {att.username} {att.id === user?.id ? '(Você)' : ''} ({att.role})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Mensagens atribuídas a um colaborador ficam na coluna dele no quadro.
                </p>
              </div>

              {/* Atalho & Categoria */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Atalho de Teclado *
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3 font-mono font-bold text-sm text-monte-verde select-none">
                      /
                    </span>
                    <input
                      type="text"
                      placeholder="ex: pix, ola, horario"
                      value={shortcut}
                      onChange={(e) => setShortcut(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                      className="w-full pl-7 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde font-mono font-semibold"
                      required
                      autoFocus
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Digite com <span className="font-mono font-bold">/</span> no chat para invocar.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Categoria (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Financeiro, Vendas"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    list="categories-datalist"
                    className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde"
                  />
                  <datalist id="categories-datalist">
                    {categories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Título */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Título Identificador *
                </label>
                <input
                  type="text"
                  placeholder="ex: Chave Pix para Pagamento"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde font-semibold"
                  required
                />
              </div>

              {/* Conteúdo */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Conteúdo da Mensagem *
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {content.length} caracteres
                  </span>
                </div>
                <textarea
                  rows={5}
                  placeholder="Digite o texto que será carregado no campo de mensagem..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde leading-relaxed resize-y"
                  required
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary text-xs px-4 py-2 rounded-xl cursor-pointer"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs px-5 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer font-bold"
                  disabled={saving}
                >
                  {saving && <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />}
                  {editingMessage ? 'Salvar Alterações' : 'Criar Mensagem'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Exclusão */}
      {deletingMessage && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Excluir Mensagem Rápida?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Tem certeza que deseja excluir o atalho <span className="font-mono font-bold text-monte-verde">/{deletingMessage.shortcut}</span> ({deletingMessage.title})?
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMessage(null)}
                className="btn-secondary text-xs px-4 py-2 rounded-xl cursor-pointer"
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="btn-danger text-xs px-4 py-2 rounded-xl inline-flex items-center gap-1.5 cursor-pointer font-bold"
                disabled={deleting}
              >
                {deleting && <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />}
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
