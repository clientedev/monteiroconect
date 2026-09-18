import { useState, useEffect, useMemo, useCallback } from 'react';
import { quickMessageApi, type QuickMessage } from '../lib/api';
import {
  MessageSquareQuote, Search, Plus, Edit2, Trash2, Copy, Check,
  Sparkles, Tag, AlertCircle, X, HelpCircle, CornerDownLeft
} from 'lucide-react';

export default function QuickMessagesPage() {
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMessage, setEditingMessage] = useState<QuickMessage | null>(null);
  const [shortcut, setShortcut] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete Confirmation Modal State
  const [deletingMessage, setDeletingMessage] = useState<QuickMessage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);
      const data = await quickMessageApi.list();
      setMessages(data);
    } catch (err: any) {
      console.error('Erro ao carregar mensagens rápidas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

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

      if (!search.trim()) return true;
      const q = search.toLowerCase().trim().replace(/^\/+/, '');
      const matchShortcut = m.shortcut.toLowerCase().includes(q);
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchContent = m.content.toLowerCase().includes(q);
      return matchShortcut || matchTitle || matchContent;
    });
  }, [messages, search, selectedCategory]);

  const handleOpenCreateModal = () => {
    setEditingMessage(null);
    setShortcut('');
    setTitle('');
    setContent('');
    setCategory('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (msg: QuickMessage) => {
    setEditingMessage(msg);
    setShortcut(msg.shortcut);
    setTitle(msg.title);
    setContent(msg.content);
    setCategory(msg.category || '');
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
      if (editingMessage) {
        await quickMessageApi.update(editingMessage.id, {
          title: title.trim(),
          shortcut: cleanShortcut,
          content: content.trim(),
          category: category.trim() || null,
        });
      } else {
        await quickMessageApi.create({
          title: title.trim(),
          shortcut: cleanShortcut,
          content: content.trim(),
          category: category.trim() || null,
        });
      }
      setIsModalOpen(false);
      await loadMessages();
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
      await loadMessages();
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

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-monte-azul tracking-tight flex items-center gap-2">
              <MessageSquareQuote className="h-7 w-7 text-monte-verde" />
              Mensagens Rápidas
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-monte-verde/15 text-monte-verde border border-monte-verde/30">
              {messages.length} cadastradas
            </span>
          </div>
          <p className="text-sm text-monte-sereno mt-1">
            Crie atalhos para agilizar o atendimento. Use <code className="px-1.5 py-0.5 bg-emerald-100 text-monte-verde font-semibold rounded text-xs">/atalho</code> no chat para carregar o texto automaticamente.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="btn-primary inline-flex items-center justify-center gap-2 shadow-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Nova Mensagem
        </button>
      </div>

      {/* Info Tips Card */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-monte-verde mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-monte-azul">Como usar nas conversas?</p>
            <p className="text-slate-600 text-xs sm:text-sm mt-0.5">
              Na caixa de digitação do chat, digite <span className="font-mono font-bold text-monte-verde">/</span> seguido do atalho ou clique no botão <span className="font-semibold text-monte-azul">⚡ Mensagem Rápida</span>. A mensagem é carregada no campo para sua conferência antes do envio.
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
            placeholder="Pesquisar por atalho (/pix), título ou texto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde transition-colors shadow-xs"
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

        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 ${
                selectedCategory === 'all'
                  ? 'bg-monte-verde text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todas
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0 ${
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

      {/* Message Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card-static p-5 animate-pulse space-y-3">
              <div className="h-4 bg-slate-200 rounded w-1/3" />
              <div className="h-5 bg-slate-200 rounded w-2/3" />
              <div className="h-16 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : filteredMessages.length === 0 ? (
        <div className="card-static p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
            <MessageSquareQuote className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-monte-azul">
              {search || selectedCategory !== 'all'
                ? 'Nenhuma mensagem rápida encontrada'
                : 'Nenhuma mensagem rápida cadastrada'}
            </h3>
            <p className="text-xs text-monte-sereno mt-1">
              {search || selectedCategory !== 'all'
                ? 'Tente ajustar os termos de pesquisa ou categoria selecionada.'
                : 'Cadastre suas respostas mais frequentes para atender com agilidade e consistência.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="btn-primary inline-flex items-center gap-1.5 text-xs py-2 px-4"
          >
            <Plus className="h-3.5 w-3.5" />
            Cadastrar Primeira Mensagem
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMessages.map(msg => (
            <div
              key={msg.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:shadow-md hover:border-monte-verde/40 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Card Header: Shortcut and Category */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-emerald-50 text-monte-verde border border-emerald-200">
                      /{msg.shortcut}
                    </span>
                    {msg.category && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                        <Tag className="h-2.5 w-2.5 text-slate-400" />
                        {msg.category}
                      </span>
                    )}
                  </div>

                  {/* Quick Actions (Hover) */}
                  <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleCopy(msg)}
                      title="Copiar texto"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-monte-azul hover:bg-slate-100 transition-colors"
                    >
                      {copiedId === msg.id ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(msg)}
                      title="Editar mensagem rápida"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-monte-azul hover:bg-slate-100 transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingMessage(msg)}
                      title="Excluir mensagem rápida"
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Card Title */}
                <h3 className="font-semibold text-slate-800 text-sm tracking-tight mb-2">
                  {msg.title}
                </h3>

                {/* Content Box */}
                <div className="bg-slate-50/80 rounded-lg p-3 text-xs text-slate-600 whitespace-pre-wrap font-sans border border-slate-100 max-h-36 overflow-y-auto leading-relaxed">
                  {msg.content}
                </div>
              </div>

              {/* Card Footer */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <CornerDownLeft className="h-3 w-3 text-slate-300" />
                  Atalho: <strong className="text-slate-600 font-mono">/{msg.shortcut}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(msg)}
                  className="text-monte-verde hover:underline font-medium flex items-center gap-1"
                >
                  {copiedId === msg.id ? (
                    <>
                      <Check className="h-3 w-3" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copiar
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-monte-azul flex items-center gap-2">
                <MessageSquareQuote className="h-5 w-5 text-monte-verde" />
                {editingMessage ? 'Editar Mensagem Rápida' : 'Nova Mensagem Rápida'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
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

              {/* Shortcut & Category in row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                      className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde font-mono"
                      required
                      autoFocus
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Digite esse atalho com <span className="font-mono font-bold">/</span> no chat para invocar.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Categoria (opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ex: Financeiro, Geral"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    list="categories-datalist"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde"
                  />
                  <datalist id="categories-datalist">
                    {categories.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Título Identificador *
                </label>
                <input
                  type="text"
                  placeholder="ex: Chave Pix para Pagamento"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde"
                  required
                />
              </div>

              {/* Content Textarea */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
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
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:border-monte-verde leading-relaxed resize-y"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Ao usar no chat, o texto é apenas carregado para conferência e <strong>não é enviado automaticamente</strong>.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="btn-secondary text-xs px-4 py-2"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary text-xs px-5 py-2 inline-flex items-center gap-1.5"
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

      {/* Delete Confirmation Modal */}
      {deletingMessage && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Excluir Mensagem Rápida?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Tem certeza que deseja excluir o atalho <span className="font-mono font-bold text-monte-verde">/{deletingMessage.shortcut}</span> ({deletingMessage.title})? Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMessage(null)}
                className="btn-secondary text-xs px-4 py-2"
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="btn-danger text-xs px-4 py-2 inline-flex items-center gap-1.5"
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
