import { useState, useEffect, useCallback } from 'react';
import { Bot, Plus, Trash2, ToggleLeft, ToggleRight, Edit3, X, MessageSquare, Smartphone, ChevronDown, ChevronUp, GripVertical, Sparkles } from 'lucide-react';

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
  useAi: boolean;
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

  const [formName, setFormName] = useState('');
  const [formAccount, setFormAccount] = useState('');
  const [formUseAi, setFormUseAi] = useState(false);
  const [formGreeting, setFormGreeting] = useState('');
  const [formFallback, setFormFallback] = useState('');
  const [formTriggerMode, setFormTriggerMode] = useState('any');
  const [formRules, setFormRules] = useState<Array<{ triggerType: string; trigger: string; reply: string; mediaType: string; mediaUrl: string }>>([
    { triggerType: 'contains', trigger: '', reply: '', mediaType: 'text', mediaUrl: '' },
  ]);
  const [creating, setCreating] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [editForm, setEditForm] = useState({ triggerType: '', trigger: '', reply: '' });

  const handleTestAi = async () => {
    setTestingAi(true);
    try {
      const { chatbotApi } = await import('../lib/api');
      const r = await chatbotApi.testAi();
      if (r.ok) {
         alert(`✅ IA do Gemini funcionando!\n\nModelo em uso: ${r.model}\n\nA IA já está respondendo nos chatbots com o toggle ✨ ativado.`);
      } else {
         alert(`❌ IA do Gemini com problema:\n\n${r.error}`);
      }
    } catch (err: any) {
      alert('❌ Erro ao testar IA: ' + (err.message || 'tente novamente'));
    } finally {
      setTestingAi(false);
    }
  };

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
        useAi: formUseAi,
        greetingMessage: formGreeting.trim() || undefined,
        fallbackMessage: formFallback.trim() || undefined,
        triggerMode: formTriggerMode,
        autoReplies: formRules.filter(r => r.trigger.trim() && r.reply.trim()),
      });
      setShowCreate(false);
      setFormName(''); setFormAccount(''); setFormUseAi(false); setFormGreeting(''); setFormFallback('');
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

  const handleToggleAi = async (id: string, useAi: boolean) => {
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.update(id, { useAi: !useAi });
      await loadData();
    } catch (err: any) { alert(err.message); }
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

  if (loading) return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-monte-verde border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Chatbots & Auto-respostas</h2>
          <p className="text-sm text-monte-sereno mt-1">Configure respostas automáticas e chatbots inteligentes</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleTestAi} disabled={testingAi} className="btn-secondary flex items-center gap-2">
            <Sparkles className={`w-4 h-4 ${testingAi ? 'animate-spin' : ''}`} />
            {testingAi ? 'Testando...' : 'Testar IA'}
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Novo Chatbot
          </button>
        </div>
      </div>

      <div className="space-y-5">
        {chatbots.map(bot => (
          <div key={bot.id} className="card-static overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 hover:bg-monte-areiaSecao/40 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm transition-all ${bot.isActive ? 'bg-gradient-to-br from-monte-verde to-monte-azul' : 'bg-monte-sereno/20'}`}>
                  <Bot className={`w-5 h-5 ${bot.isActive ? 'text-white' : 'text-monte-sereno'}`} />
                </div>
                <div>
                  <h3 className="font-bold font-display text-monte-azul">{bot.name}</h3>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {bot.whatsappAccount && (
                      <span className="text-xs text-monte-sereno flex items-center gap-1">
                        <Smartphone className="w-3 h-3" /> {bot.whatsappAccount.name}
                      </span>
                    )}
                    <span className={`badge text-[10px] ${bot.isActive ? 'badge-green' : 'badge-gray'}`}>
                      {bot.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                    {bot.useAi && (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-sm">
                         <Sparkles className="w-3 h-3" /> IA Gemini
                      </span>
                    )}
                    <span className="text-xs text-monte-sereno/60">{bot.autoReplies.length} regras</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggleAi(bot.id, bot.useAi)}
                  className={`p-2 rounded-full transition-colors ${bot.useAi ? 'bg-purple-100 hover:bg-purple-200' : 'hover:bg-monte-areiaSecao'}`}
                   title={bot.useAi ? 'Desativar IA Gemini' : 'Ativar IA Gemini (assistente de seguros e planos de saúde)'}
                >
                  <Sparkles className={`w-5 h-5 ${bot.useAi ? 'text-purple-600' : 'text-monte-sereno'}`} />
                </button>
                <button onClick={() => handleToggle(bot.id)} className="p-2 rounded-full hover:bg-monte-areiaSecao transition-colors" title={bot.isActive ? 'Desativar' : 'Ativar'}>
                  {bot.isActive ? <ToggleRight className="w-6 h-6 text-monte-verde" /> : <ToggleLeft className="w-6 h-6 text-monte-sereno" />}
                </button>
                <button onClick={() => setExpandedId(expandedId === bot.id ? null : bot.id)} className="p-2 rounded-full hover:bg-monte-areiaSecao transition-colors" title="Detalhes">
                  {expandedId === bot.id ? <ChevronUp className="w-5 h-5 text-monte-sereno" /> : <ChevronDown className="w-5 h-5 text-monte-sereno" />}
                </button>
                <button onClick={() => handleDelete(bot.id)} className="p-2 rounded-full hover:bg-monte-terracota/10 text-monte-sereno hover:text-monte-terracota transition-colors" title="Excluir">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {expandedId === bot.id && (
              <div className="border-t border-monte-sereno/15 px-6 py-5 bg-monte-areiaSecao/30">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                  <div className="bg-white/60 rounded-2xl p-3 border border-monte-sereno/10">
                    <p className="text-[11px] font-semibold text-monte-sereno uppercase tracking-wider mb-1">Modo de gatilho</p>
                    <p className="text-sm font-medium text-monte-azul">{triggerModeLabels[bot.triggerMode] || bot.triggerMode}</p>
                  </div>
                  {bot.greetingMessage && (
                    <div className="bg-white/60 rounded-2xl p-3 border border-monte-sereno/10">
                      <p className="text-[11px] font-semibold text-monte-sereno uppercase tracking-wider mb-1">Saudação</p>
                      <p className="text-sm text-monte-azul line-clamp-2">{bot.greetingMessage}</p>
                    </div>
                  )}
                  {bot.fallbackMessage && (
                    <div className="bg-white/60 rounded-2xl p-3 border border-monte-sereno/10">
                      <p className="text-[11px] font-semibold text-monte-sereno uppercase tracking-wider mb-1">Fallback</p>
                      <p className="text-sm text-monte-azul line-clamp-2">{bot.fallbackMessage}</p>
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-sm font-semibold text-monte-azul mb-3 flex items-center gap-2 font-display">
                    <MessageSquare className="w-4 h-4" /> Regras de Auto-resposta
                  </p>
                  <div className="space-y-2">
                    {bot.autoReplies.map((rule, idx) => (
                      <div key={rule.id || idx} className="bg-white/70 rounded-2xl border border-monte-sereno/10 p-4">
                        {editingReply === rule.id ? (
                          <div className="space-y-3">
                            <div className="flex gap-2">
                              <select className="input-rect w-auto" value={editForm.triggerType} onChange={e => setEditForm({ ...editForm, triggerType: e.target.value })}>
                                <option value="contains">Contém</option>
                                <option value="exact">Exato</option>
                                <option value="starts_with">Começa com</option>
                                <option value="regex">Regex</option>
                                <option value="always">Sempre</option>
                              </select>
                              <input className="input-rect flex-1" placeholder="Gatilho" value={editForm.trigger} onChange={e => setEditForm({ ...editForm, trigger: e.target.value })} />
                            </div>
                            <textarea className="input-rect" rows={2} placeholder="Resposta" value={editForm.reply} onChange={e => setEditForm({ ...editForm, reply: e.target.value })} />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingReply(null)} className="btn-secondary text-xs py-1.5 px-4">Cancelar</button>
                              <button onClick={() => handleUpdateReply(rule.id!)} className="btn-primary text-xs py-1.5 px-4">Salvar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <GripVertical className="w-3 h-3 text-monte-sereno/40" />
                                <span className="badge badge-blue text-[10px]">{triggerTypeLabels[rule.triggerType] || rule.triggerType}</span>
                                <span className="text-sm font-medium text-monte-azul truncate">{rule.trigger}</span>
                              </div>
                              <p className="text-sm text-monte-sereno pl-5">{rule.reply}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => setEditingReply(rule.id!)} className="p-1.5 rounded-full hover:bg-monte-areiaSecao text-monte-sereno hover:text-monte-azul transition-colors" title="Editar">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteReply(bot.id, rule.id!)} className="p-1.5 rounded-full hover:bg-monte-terracota/10 text-monte-sereno hover:text-monte-terracota transition-colors" title="Excluir">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {bot.autoReplies.length === 0 && (
                      <p className="text-sm text-monte-sereno text-center py-4">Nenhuma regra configurada</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {chatbots.length === 0 && !loading && (
          <div className="card-static p-16 text-center">
            <Bot className="w-16 h-16 text-monte-sereno/20 mx-auto mb-4" />
            <p className="text-monte-sereno font-display font-semibold text-lg mb-2">Nenhum chatbot configurado</p>
            <p className="text-sm text-monte-sereno/70 mb-5">Crie chatbots para responder automaticamente mensagens dos seus Whatsapps</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              <Plus className="w-4 h-4 inline mr-2" />Criar Primeiro Chatbot
            </button>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-monte-azul/30 backdrop-blur-sm flex items-start justify-center pt-10 overflow-y-auto" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-4xl w-full max-w-lg mx-4 shadow-2xl mb-10" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-monte-sereno/15">
              <h3 className="text-lg font-bold font-display text-monte-azul flex items-center gap-2">
                <Bot className="w-5 h-5 text-monte-verde" /> Novo Chatbot
              </h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-full text-monte-sereno hover:text-monte-azul hover:bg-monte-areiaSecao transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-monte-azul mb-2">Nome do Chatbot</label>
                  <input className="input-rect" placeholder="Ex: Bot de Vendas" value={formName} onChange={e => setFormName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-monte-azul mb-2">Conta WhatsApp</label>
                  <select className="input-rect" value={formAccount} onChange={e => setFormAccount(e.target.value)}>
                    <option value="">Selecione...</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} {a.phone ? `(${a.phone})` : ''}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-monte-azul mb-2">Modo de Gatilho</label>
                <select className="input-rect" value={formTriggerMode} onChange={e => setFormTriggerMode(e.target.value)}>
                  <option value="any">Qualquer mensagem (responde tudo)</option>
                  <option value="first_message">Apenas primeira mensagem (com saudação)</option>
                  <option value="keyword_only">Apenas palavras-chave configuradas</option>
                </select>
              </div>

              <label className="flex items-start gap-3 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200/60 rounded-2xl p-4 cursor-pointer transition-all hover:shadow-md">
                <input
                  type="checkbox"
                  checked={formUseAi}
                  onChange={e => setFormUseAi(e.target.checked)}
                  className="w-4 h-4 mt-1 accent-purple-600 flex-shrink-0"
                />
                <div>
                  <p className="text-sm font-bold text-monte-azul flex items-center gap-1.5">
                     <Sparkles className="w-4 h-4 text-purple-600" /> IA Gemini — Assistente Inteligente
                  </p>
                  <p className="text-xs text-monte-sereno mt-1 leading-relaxed">
                     Quando ativa, a IA do Gemini responde os clientes automaticamente, treinada para falar
                    apenas sobre seguros, planos de saúde e a Monteiro Corretora. As regras de palavras-chave
                     continuam como alternativa quando a IA não responde. Requer a variável GEMINI_API_KEY no servidor.
                  </p>
                </div>
              </label>

              <div>
                <label className="block text-sm font-medium text-monte-azul mb-2">Mensagem de Saudação (opcional)</label>
                <textarea className="input-rect" rows={2} placeholder="Ex: Olá! Como posso ajudar?" value={formGreeting} onChange={e => setFormGreeting(e.target.value)} />
              </div>

              <div>
                <label className="block text-sm font-medium text-monte-azul mb-2">Mensagem Fallback (opcional)</label>
                <textarea className="input-rect" rows={2} placeholder="Ex: Não entendi, vou transferir para um atendente." value={formFallback} onChange={e => setFormFallback(e.target.value)} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-monte-azul">Regras de Auto-resposta</label>
                  <button onClick={addRule} className="text-xs text-monte-verde hover:text-monte-azul font-semibold flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Adicionar regra
                  </button>
                </div>
                <div className="space-y-3">
                  {formRules.map((rule, idx) => (
                    <div key={idx} className="bg-monte-areiaSecao/60 rounded-2xl p-3 border border-monte-sereno/10">
                      <div className="flex gap-2 mb-2">
                        <select className="input-rect w-auto text-xs" value={rule.triggerType} onChange={e => {
                          const newRules = [...formRules];
                          newRules[idx].triggerType = e.target.value;
                          setFormRules(newRules);
                        }}>
                          <option value="contains">Contém</option>
                          <option value="exact">Exato</option>
                          <option value="starts_with">Começa com</option>
                          <option value="regex">Regex</option>
                          <option value="always">Sempre</option>
                        </select>
                        <input className="input-rect flex-1 text-xs" placeholder="Gatilho" value={rule.trigger} onChange={e => {
                          const newRules = [...formRules];
                          newRules[idx].trigger = e.target.value;
                          setFormRules(newRules);
                        }} />
                        {formRules.length > 1 && (
                          <button onClick={() => removeRule(idx)} className="p-1.5 text-monte-sereno hover:text-monte-terracota rounded-full">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <textarea className="input-rect text-xs" rows={2} placeholder="Resposta automática..." value={rule.reply} onChange={e => {
                        const newRules = [...formRules];
                        newRules[idx].reply = e.target.value;
                        setFormRules(newRules);
                      }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-monte-sereno/15 bg-monte-areiaSecao/30 rounded-b-4xl">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={handleCreate} disabled={creating || !formName.trim() || !formAccount} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {creating ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Bot className="w-4 h-4" />}
                {creating ? 'Criando...' : 'Criar Chatbot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
