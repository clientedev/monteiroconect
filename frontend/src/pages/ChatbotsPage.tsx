import { useState, useEffect, useCallback } from 'react';
import { Bot, Plus, Trash2, ToggleLeft, ToggleRight, Edit3, X, MessageSquare, Smartphone, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';

interface AutoReplyRule {
  id?: string;
  triggerType: string;
  trigger: string;
  reply: string;
  mediaType: string;
  mediaUrl: string;
  isActive: boolean;
}

interface Chatbot {
  id: string;
  name: string;
  isActive: boolean;
  greetingMessage: string | null;
  fallbackMessage: string | null;
  triggerMode: string;
  whatsappAccount: { id: string; name: string; phone: string | null } | null;
  autoReplies: AutoReplyRule[];
  createdAt: string;
}

interface WhatsAppAccount {
  id: string;
  name: string;
  phone: string | null;
  status: string;
}

const triggerTypeLabels: Record<string, string> = {
  contains: 'Contém texto',
  exact: 'Exato',
  starts_with: 'Começa com',
  regex: 'Expressão Regular',
  always: 'Sempre responder',
};

const triggerModeLabels: Record<string, string> = {
  any: 'Qualquer mensagem',
  first_message: 'Primeira mensagem',
  keyword_only: 'Apenas palavras-chave',
};

export default function ChatbotsPage() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState<string | null>(null);

  // Create form
  const [formName, setFormName] = useState('');
  const [formAccount, setFormAccount] = useState('');
  const [formGreeting, setFormGreeting] = useState('');
  const [formFallback, setFormFallback] = useState('');
  const [formTriggerMode, setFormTriggerMode] = useState('any');
  const [formRules, setFormRules] = useState<Array<{ triggerType: string; trigger: string; reply: string; mediaType: string; mediaUrl: string }>>([
    { triggerType: 'contains', trigger: '', reply: '', mediaType: 'text', mediaUrl: '' },
  ]);
  const [creating, setCreating] = useState(false);

  // Edit reply form
  const [editForm, setEditForm] = useState({ triggerType: '', trigger: '', reply: '' });

  const loadData = useCallback(async () => {
    try {
      const { chatbotApi, whatsappApi } = await import('../lib/api');
      const [bots, accs] = await Promise.all([chatbotApi.list(), whatsappApi.list()]);
      setChatbots(bots);
      setAccounts(accs.filter((a: WhatsAppAccount) => a.status === 'CONNECTED'));
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCreate = async () => {
    if (!formName.trim() || !formAccount) return;
    setCreating(true);
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.create({
        name: formName.trim(),
        whatsappAccountId: formAccount,
        greetingMessage: formGreeting.trim() || undefined,
        fallbackMessage: formFallback.trim() || undefined,
        triggerMode: formTriggerMode,
        autoReplies: formRules.filter(r => r.trigger.trim() && r.reply.trim()),
      });
      setShowCreate(false);
      setFormName(''); setFormAccount(''); setFormGreeting(''); setFormFallback('');
      setFormTriggerMode('any');
      setFormRules([{ triggerType: 'contains', trigger: '', reply: '', mediaType: 'text', mediaUrl: '' }]);
      await loadData();
    } catch (err: any) { alert(err.message); }
    finally { setCreating(false); }
  };

  const handleToggle = async (id: string) => {
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.toggle(id);
      await loadData();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este chatbot?')) return;
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.delete(id);
      await loadData();
    } catch {}
  };

  const handleDeleteReply = async (chatbotId: string, replyId: string) => {
    if (!confirm('Excluir esta regra de auto-resposta?')) return;
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.deleteReply(replyId);
      await loadData();
    } catch {}
  };

  const handleUpdateReply = async (replyId: string) => {
    if (!editForm.trigger.trim() || !editForm.reply.trim()) return;
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.updateReply(replyId, editForm);
      setEditingReply(null);
      await loadData();
    } catch (err: any) { alert(err.message); }
  };

  const addRule = () => {
    setFormRules([...formRules, { triggerType: 'contains', trigger: '', reply: '', mediaType: 'text', mediaUrl: '' }]);
  };

  const removeRule = (idx: number) => {
    setFormRules(formRules.filter((_, i) => i !== idx));
  };

  if (loading) return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Chatbots & Auto-respostas</h2>
          <p className="text-sm text-gray-500 mt-1">Configure respostas automáticas e chatbots inteligentes para seus WhatsApps</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo Chatbot
        </button>
      </div>

      {/* Chatbot list */}
      <div className="space-y-4">
        {chatbots.map(bot => (
          <div key={bot.id} className="card overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm ${bot.isActive ? 'bg-gradient-to-br from-brand-400 to-brand-600' : 'bg-gray-200'}`}>
                  <Bot className={`w-5 h-5 ${bot.isActive ? 'text-white' : 'text-gray-500'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{bot.name}</h3>
                  <div className="flex items-center gap-3 mt-0.5">
                    {bot.whatsappAccount && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Smartphone className="w-3 h-3" /> {bot.whatsappAccount.name}
                      </span>
                    )}
                    <span className={`badge text-[10px] ${bot.isActive ? 'badge-green' : 'badge-gray'}`}>
                      {bot.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                    <span className="text-xs text-gray-400">{bot.autoReplies.length} regras</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button onClick={() => handleToggle(bot.id)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title={bot.isActive ? 'Desativar' : 'Ativar'}>
                  {bot.isActive ? <ToggleRight className="w-5 h-5 text-brand-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                </button>
                <button
                  onClick={() => setExpandedId(expandedId === bot.id ? null : bot.id)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Detalhes"
                >
                  {expandedId === bot.id ? <ChevronUp className="w-5 h-5 text-gray-500" /> : <ChevronDown className="w-5 h-5 text-gray-500" />}
                </button>
                <button onClick={() => handleDelete(bot.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Excluir">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {expandedId === bot.id && (
              <div className="border-t border-gray-100 px-5 py-4 bg-gray-50/50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-white rounded-lg p-3 border border-gray-100">
                    <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Modo de gatilho</p>
                    <p className="text-sm font-medium text-gray-700">{triggerModeLabels[bot.triggerMode] || bot.triggerMode}</p>
                  </div>
                  {bot.greetingMessage && (
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Saudação</p>
                      <p className="text-sm text-gray-700 line-clamp-2">{bot.greetingMessage}</p>
                    </div>
                  )}
                  {bot.fallbackMessage && (
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Fallback</p>
                      <p className="text-sm text-gray-700 line-clamp-2">{bot.fallbackMessage}</p>
                    </div>
                  )}
                </div>

                {/* Auto-reply rules */}
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" /> Regras de Auto-resposta
                  </p>
                  <div className="space-y-2">
                    {bot.autoReplies.map((rule, idx) => (
                      <div key={rule.id || idx} className="bg-white rounded-lg border border-gray-100 p-3">
                        {editingReply === rule.id ? (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <select
                                className="input w-auto"
                                value={editForm.triggerType}
                                onChange={e => setEditForm({ ...editForm, triggerType: e.target.value })}
                              >
                                <option value="contains">Contém</option>
                                <option value="exact">Exato</option>
                                <option value="starts_with">Começa com</option>
                                <option value="regex">Regex</option>
                                <option value="always">Sempre</option>
                              </select>
                              <input
                                className="input flex-1"
                                placeholder="Gatilho"
                                value={editForm.trigger}
                                onChange={e => setEditForm({ ...editForm, trigger: e.target.value })}
                              />
                            </div>
                            <textarea
                              className="input"
                              rows={2}
                              placeholder="Resposta"
                              value={editForm.reply}
                              onChange={e => setEditForm({ ...editForm, reply: e.target.value })}
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingReply(null)} className="btn-secondary text-xs py-1.5 px-3">Cancelar</button>
                              <button onClick={() => handleUpdateReply(rule.id!)} className="btn-primary text-xs py-1.5 px-3">Salvar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <GripVertical className="w-3 h-3 text-gray-300" />
                                <span className="badge badge-blue text-[10px]">{triggerTypeLabels[rule.triggerType] || rule.triggerType}</span>
                                <span className="text-sm font-medium text-gray-800 truncate">{rule.trigger}</span>
                              </div>
                              <p className="text-sm text-gray-600 pl-5">{rule.reply}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => setEditingReply(rule.id!)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                title="Editar"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteReply(bot.id, rule.id!)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {bot.autoReplies.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-3">Nenhuma regra configurada</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {chatbots.length === 0 && !loading && (
          <div className="card p-12 text-center">
            <Bot className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium mb-2">Nenhum chatbot configurado</p>
            <p className="text-sm text-gray-400 mb-4">Crie chatbots para responder automaticamente mensagens dos seus WhatsApps</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="w-4 h-4 inline mr-2" />Criar Primeiro Chatbot
            </button>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-10 overflow-y-auto" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-2xl mb-10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Bot className="w-5 h-5 text-brand-600" /> Novo Chatbot
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Chatbot</label>
                  <input className="input" placeholder="Ex: Bot de Vendas" value={formName} onChange={e => setFormName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Conta WhatsApp</label>
                  <select className="input" value={formAccount} onChange={e => setFormAccount(e.target.value)}>
                    <option value="">Selecione...</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} {a.phone ? `(${a.phone})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modo de Gatilho</label>
                <select className="input" value={formTriggerMode} onChange={e => setFormTriggerMode(e.target.value)}>
                  <option value="any">Qualquer mensagem (responde tudo)</option>
                  <option value="first_message">Apenas primeira mensagem (com saudação)</option>
                  <option value="keyword_only">Apenas palavras-chave configuradas</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem de Saudação (opcional)</label>
                <textarea className="input" rows={2} placeholder="Ex: Olá! Como posso ajudar?" value={formGreeting} onChange={e => setFormGreeting(e.target.value)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem Fallback (opcional)</label>
                <textarea className="input" rows={2} placeholder="Ex: Não entendi, vou transferir para um atendente." value={formFallback} onChange={e => setFormFallback(e.target.value)} />
              </div>

              {/* Rules */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-gray-700">Regras de Auto-resposta</label>
                  <button onClick={addRule} className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Adicionar regra
                  </button>
                </div>
                <div className="space-y-3">
                  {formRules.map((rule, idx) => (
                    <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <div className="flex gap-2 mb-2">
                        <select
                          className="input w-auto text-xs"
                          value={rule.triggerType}
                          onChange={e => {
                            const newRules = [...formRules];
                            newRules[idx].triggerType = e.target.value;
                            setFormRules(newRules);
                          }}
                        >
                          <option value="contains">Contém</option>
                          <option value="exact">Exato</option>
                          <option value="starts_with">Começa com</option>
                          <option value="regex">Regex</option>
                          <option value="always">Sempre</option>
                        </select>
                        <input
                          className="input flex-1 text-xs"
                          placeholder="Gatilho (ex: preço, horário, oi)"
                          value={rule.trigger}
                          onChange={e => {
                            const newRules = [...formRules];
                            newRules[idx].trigger = e.target.value;
                            setFormRules(newRules);
                          }}
                        />
                        {formRules.length > 1 && (
                          <button onClick={() => removeRule(idx)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <textarea
                        className="input text-xs"
                        rows={2}
                        placeholder="Resposta automática..."
                        value={rule.reply}
                        onChange={e => {
                          const newRules = [...formRules];
                          newRules[idx].reply = e.target.value;
                          setFormRules(newRules);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleCreate} disabled={creating || !formName.trim() || !formAccount} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {creating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Bot className="w-4 h-4" />}
                {creating ? 'Criando...' : 'Criar Chatbot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
