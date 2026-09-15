import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bot, Plus, Trash2, ToggleLeft, ToggleRight, Edit3, X, MessageSquare,
  Smartphone, ChevronDown, ChevronUp, Sparkles, Check, ArrowRight,
  ArrowLeft, Send, HelpCircle, Layers, Zap, Clock, ShieldCheck, CheckCircle2
} from 'lucide-react';

interface AutoReplyRule {
  id?: string;
  triggerType: string;
  trigger: string;
  reply: string;
  mediaType?: string;
  mediaUrl?: string;
  isActive?: boolean;
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

// Templates pré-configurados prontos para uso
const BOT_TEMPLATES = [
  {
    id: 'ai-gemini',
    title: 'IA Gemini Inteligente',
    badge: 'Mais Recomendado',
    badgeColor: 'bg-purple-100 text-purple-700 border-purple-200',
    icon: Sparkles,
    iconBg: 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white',
    description: 'Responde dúvidas sobre seguros e planos de saúde de forma natural e profissional com Inteligência Artificial.',
    defaultName: 'Assistente Inteligente Monteiro',
    useAi: true,
    triggerMode: 'any',
    greeting: 'Olá! Sou o assistente virtual da Monteiro Corretora de Seguros. Como posso ajudar você hoje com seu plano de saúde, seguro de vida ou automóvel?',
    fallback: 'Entendi! Vou transferir sua conversa para um de nossos corretores especialistas dar continuidade no seu atendimento.',
    rules: [
      { triggerType: 'contains', trigger: 'humano', reply: 'Com certeza! Vou solicitar que um atendente da nossa equipe fale diretamente com você em instantes.' },
    ],
  },
  {
    id: 'menu-options',
    title: 'Menu de Opções (1, 2, 3)',
    badge: 'Atendimento Rápido',
    badgeColor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: Layers,
    iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white',
    description: 'Apresenta um menu numérico para o cliente escolher o que precisa e recebe respostas instantâneas.',
    defaultName: 'Menu de Atendimento WhatsApp',
    useAi: false,
    triggerMode: 'first_message',
    greeting: 'Olá! Seja bem-vindo à Monteiro Corretora de Seguros.\n\nPor favor, digite o número da opção desejada:\n1️⃣ Planos de Saúde\n2️⃣ Seguro Auto e Residencial\n3️⃣ Falar com um Atendente',
    fallback: 'Não consegui identificar essa opção. Por favor, digite 1, 2 ou 3 para escolher o atendimento desejado.',
    rules: [
      { triggerType: 'exact', trigger: '1', reply: 'Excelente! Trabalhamos com as melhores operadoras: Unimed, Bradesco, Amil, SulAmérica e Notredame. Um de nossos corretores vai te enviar uma simulação personalizada em instantes.' },
      { triggerType: 'exact', trigger: '2', reply: 'Perfeito! Oferecemos as melhores condições para proteger seu veículo e sua casa. Aguarde um instante que um corretor vai preparar sua cotação.' },
      { triggerType: 'exact', trigger: '3', reply: 'Com certeza! Nossa equipe já foi notificada e um corretor entrará em contato com você aqui mesmo no WhatsApp.' },
    ],
  },
  {
    id: 'welcome-hours',
    title: 'Boas-Vindas & Horário',
    badge: 'Informativo',
    badgeColor: 'bg-sky-100 text-sky-700 border-sky-200',
    icon: Clock,
    iconBg: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white',
    description: 'Envia uma recepção cordial e informa o horário de funcionamento na primeira mensagem do cliente.',
    defaultName: 'Boas-Vindas e Horário',
    useAi: false,
    triggerMode: 'first_message',
    greeting: 'Olá! Que bom ter você aqui na Monteiro Corretora de Seguros. Nosso horário de atendimento é de Segunda a Sexta, das 08h às 18h. Já recebemos sua mensagem e em breve um corretor irá te responder!',
    fallback: 'Recebemos sua mensagem! Nossa equipe responderá o mais breve possível.',
    rules: [
      { triggerType: 'contains', trigger: 'endereço', reply: 'Estamos localizados prontos para te atender. Se preferir, também atendemos 100% digitalmente por este WhatsApp!' },
    ],
  },
  {
    id: 'faq-seguros',
    title: 'FAQ e Dúvidas Frequentes',
    badge: 'Suporte',
    badgeColor: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: HelpCircle,
    iconBg: 'bg-gradient-to-br from-orange-500 to-amber-500 text-white',
    description: 'Responde automaticamente às dúvidas mais comuns sobre boletos, carteirinhas, sinistros e carências.',
    defaultName: 'Central de Ajuda Automática',
    useAi: false,
    triggerMode: 'any',
    greeting: 'Olá! Sou o assistente de suporte da Monteiro Corretora. Como posso ajudar com seu seguro ou plano hoje?',
    fallback: 'Para essa solicitação mais específica, vou transferir para um de nossos especialistas. Aguarde um instante!',
    rules: [
      { triggerType: 'contains', trigger: 'boleto', reply: 'Para solicitar a 2ª via do seu boleto, acesse o aplicativo da sua Seguradora/Operadora, ou aguarde que um atendente já vai enviá-lo por aqui!' },
      { triggerType: 'contains', trigger: 'carteirinha', reply: 'A carteirinha digital pode ser acessada direto no app da operadora de saúde. Quer ajuda para baixar o app? Um atendente já vai te ajudar.' },
      { triggerType: 'contains', trigger: 'carência', reply: 'As informações sobre carências estão no seu contrato, mas um de nossos especialistas vai verificar sua apólice e te informar exatamente o que já está liberado. Aguarde um momento!' },
      { triggerType: 'contains', trigger: 'sinistro', reply: 'Sinto muito que tenha ocorrido um sinistro. Fique tranquilo, estamos aqui para ajudar! Por favor, tenha em mãos o BO (se aplicável) e fotos do ocorrido. Um analista vai assumir o atendimento agora.' },
    ],
  },
  {
    id: 'triagem-setores',
    title: 'Triagem por Setores',
    badge: 'Organização',
    badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Layers,
    iconBg: 'bg-gradient-to-br from-blue-500 to-cyan-600 text-white',
    description: 'Um menu clássico para direcionar o cliente ao setor correto (Vendas, Financeiro ou Sinistros).',
    defaultName: 'Triagem Inicial',
    useAi: false,
    triggerMode: 'first_message',
    greeting: 'Olá! Seja bem-vindo à Monteiro Corretora.\n\nPara agilizar seu atendimento, digite o número da opção desejada:\n\n1️⃣ Cotações e Vendas\n2️⃣ Boletos e Financeiro\n3️⃣ Sinistros e Suporte',
    fallback: 'Opção inválida. Por favor, digite 1, 2 ou 3.',
    rules: [
      { triggerType: 'exact', trigger: '1', reply: 'Ótima escolha! Um de nossos corretores vai te atender em instantes para simular as melhores opções do mercado para você.' },
      { triggerType: 'exact', trigger: '2', reply: 'Certo, setor Financeiro. Por favor, informe o CPF ou CNPJ do titular que um atendente já vai te enviar os boletos ou extratos.' },
      { triggerType: 'exact', trigger: '3', reply: 'Certo, setor de Suporte/Sinistros. Relate brevemente o que aconteceu que um de nossos especialistas vai assumir seu atendimento imediatamente.' },
    ],
  },
  {
    id: 'lead-capture',
    title: 'Captura Fora do Expediente',
    badge: 'Leads',
    badgeColor: 'bg-rose-100 text-rose-700 border-rose-200',
    icon: ShieldCheck,
    iconBg: 'bg-gradient-to-br from-rose-500 to-pink-600 text-white',
    description: 'Ideal para ligar à noite ou finais de semana. Coleta dados do cliente para a equipe retornar depois.',
    defaultName: 'Recepção Fora de Hora',
    useAi: false,
    triggerMode: 'first_message',
    greeting: 'Olá! No momento estamos fora do nosso horário de atendimento.\n\nMas não se preocupe! Qual é o seu *Nome Completo* e o *Tipo de Seguro* (ou plano de saúde) que você tem interesse? Assim que retornarmos, um corretor falará com você!',
    fallback: 'Mensagem recebida! Nossa equipe entrará em contato com você logo no primeiro horário do próximo dia útil. Obrigado!',
    rules: [],
  },
  {
    id: 'custom',
    title: 'Personalizado do Zero',
    badge: 'Flexível',
    badgeColor: 'bg-gray-100 text-gray-700 border-gray-200',
    icon: Zap,
    iconBg: 'bg-gradient-to-br from-monte-verde to-monte-azul text-white',
    description: 'Monte o seu chatbot configurando cada palavra-chave e mensagem de resposta livremente.',
    defaultName: 'Meu Chatbot Personalizado',
    useAi: false,
    triggerMode: 'any',
    greeting: 'Olá! Como podemos ajudar hoje?',
    fallback: '',
    rules: [
      { triggerType: 'contains', trigger: 'preço', reply: 'Para consultar valores e fazer uma simulação personalizada, informe sua idade e cidade.' },
    ],
  },
];

export default function ChatbotsPage() {
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [accounts, setAccounts] = useState<WhatsAppAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('ai-gemini');

  // Form state
  const [botName, setBotName] = useState('');
  const [botAccount, setBotAccount] = useState('');
  const [botUseAi, setBotUseAi] = useState(true);
  const [botTriggerMode, setBotTriggerMode] = useState('any');
  const [botGreeting, setBotGreeting] = useState('');
  const [botFallback, setBotFallback] = useState('');
  const [botRules, setBotRules] = useState<Array<{ triggerType: string; trigger: string; reply: string }>>([]);

  // Simulator state
  const [previewTestInput, setPreviewTestInput] = useState('');
  const [simulatedMessages, setSimulatedMessages] = useState<Array<{ from: 'client' | 'bot'; text: string; time: string }>>([]);

  // Editing reply inside expanded bot
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ triggerType: 'contains', trigger: '', reply: '' });
  const [newReplyForm, setNewReplyForm] = useState<{ botId: string | null; trigger: string; reply: string }>({ botId: null, trigger: '', reply: '' });

  const [creating, setCreating] = useState(false);
  const [testingAi, setTestingAi] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { chatbotApi, whatsappApi } = await import('../lib/api');
      const [bots, accs] = await Promise.all([chatbotApi.list(), whatsappApi.list()]);
      setChatbots(bots);
      setAccounts(accs.filter((a: WhatsAppAccount) => a.status === 'CONNECTED'));
    } catch (e) {
      console.error('Erro ao carregar chatbots', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Aplica um template ao formulário do Wizard
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    const tmpl = BOT_TEMPLATES.find(t => t.id === templateId) || BOT_TEMPLATES[0];
    setBotName(tmpl.defaultName);
    setBotUseAi(tmpl.useAi);
    setBotTriggerMode(tmpl.triggerMode);
    setBotGreeting(tmpl.greeting);
    setBotFallback(tmpl.fallback);
    setBotRules(tmpl.rules.map(r => ({ ...r })));

    // Inicializa simulação
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    setSimulatedMessages([
      { from: 'client', text: 'Olá, gostaria de informações', time },
      ...(tmpl.greeting ? [{ from: 'bot' as const, text: tmpl.greeting, time }] : []),
    ]);
  };

  // Abre o wizard configurado
  const openWizardWithTemplate = (templateId = 'ai-gemini') => {
    handleSelectTemplate(templateId);
    if (accounts.length > 0 && !botAccount) {
      setBotAccount(accounts[0].id);
    }
    setWizardStep(1);
    setShowWizard(true);
  };

  // Testa simulação do WhatsApp Preview
  const handleSendSimulatorMessage = () => {
    if (!previewTestInput.trim()) return;
    const text = previewTestInput.trim();
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const newMsgs = [...simulatedMessages, { from: 'client' as const, text, time }];
    setSimulatedMessages(newMsgs);
    setPreviewTestInput('');

    // Procura resposta nas regras
    setTimeout(() => {
      const matchedRule = botRules.find(r => {
        const trig = r.trigger.trim().toLowerCase();
        if (!trig) return false;
        if (r.triggerType === 'exact') return text.toLowerCase() === trig;
        return text.toLowerCase().includes(trig);
      });

      let replyText = '';
      if (matchedRule) {
        replyText = matchedRule.reply;
      } else if (botUseAi) {
        replyText = `✨ [Resposta IA Gemini]: Olá! Para podermos te auxiliar com o melhor plano ou seguro para o seu perfil, me conte um pouco mais sobre o que você procura!`;
      } else if (botFallback) {
        replyText = botFallback;
      } else {
        replyText = 'Mensagem recebida pela Monteiro Corretora.';
      }

      setSimulatedMessages(prev => [...prev, { from: 'bot' as const, text: replyText, time }]);
    }, 400);
  };

  const handleTestAi = async () => {
    setTestingAi(true);
    try {
      const { chatbotApi } = await import('../lib/api');
      const r = await chatbotApi.testAi();
      if (r.ok) {
        alert(`✅ IA do Gemini funcionando perfeitamente!\n\nModelo em uso: ${r.model}\n\nO assistente responderá dúvidas sobre seguros e planos de saúde automaticamente.`);
      } else {
        alert(`❌ Problema com a IA do Gemini:\n\n${r.error}`);
      }
    } catch (err: any) {
      alert('❌ Erro ao testar IA: ' + (err.message || 'Tente novamente'));
    } finally {
      setTestingAi(false);
    }
  };

  const handleCreateBot = async () => {
    if (!botName.trim()) {
      alert('Por favor, dê um nome ao seu chatbot.');
      return;
    }
    if (!botAccount) {
      alert('Por favor, selecione qual conta de WhatsApp receberá este chatbot.');
      return;
    }

    setCreating(true);
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.create({
        name: botName.trim(),
        whatsappAccountId: botAccount,
        useAi: botUseAi,
        greetingMessage: botGreeting.trim() || undefined,
        fallbackMessage: botFallback.trim() || undefined,
        triggerMode: botTriggerMode,
        autoReplies: botRules.filter(r => r.trigger.trim() && r.reply.trim()),
      });
      setShowWizard(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar chatbot');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.toggle(id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleAi = async (id: string, currentUseAi: boolean) => {
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.update(id, { useAi: !currentUseAi });
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o chatbot "${name}"?`)) return;
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.delete(id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleQuickAddReply = async (botId: string) => {
    if (!newReplyForm.trigger.trim() || !newReplyForm.reply.trim()) return;
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.addReply(botId, {
        triggerType: 'contains',
        trigger: newReplyForm.trigger.trim(),
        reply: newReplyForm.reply.trim(),
      });
      setNewReplyForm({ botId: null, trigger: '', reply: '' });
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao adicionar regra');
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!confirm('Excluir esta resposta automática?')) return;
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.deleteReply(replyId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateReply = async (replyId: string) => {
    if (!editForm.trigger.trim() || !editForm.reply.trim()) return;
    try {
      const { chatbotApi } = await import('../lib/api');
      await chatbotApi.updateReply(replyId, editForm);
      setEditingReplyId(null);
      await loadData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-monte-sereno">
        <div className="animate-spin h-8 w-8 border-4 border-monte-verde border-t-transparent rounded-full mb-3" />
        <p className="text-sm">Carregando chatbots...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="section-title text-2xl">Chatbots & Auto-respostas</h2>
            <span className="badge badge-green text-xs font-semibold">{chatbots.length} configurados</span>
          </div>
          <p className="text-xs sm:text-sm text-monte-sereno mt-1">
            Automatize o atendimento dos seus WhatsApps com Inteligência Artificial ou regras simples
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            onClick={handleTestAi}
            disabled={testingAi}
            className="btn-secondary flex items-center gap-2 text-xs sm:text-sm py-2.5 px-4 shadow-xs"
            title="Testa se a chave de IA do Gemini está configurada e respondendo"
          >
            <Sparkles className={`w-4 h-4 text-purple-600 ${testingAi ? 'animate-spin' : ''}`} />
            <span>{testingAi ? 'Testando IA...' : 'Testar IA Gemini'}</span>
          </button>
          <button
            onClick={() => openWizardWithTemplate('ai-gemini')}
            className="btn-primary flex items-center gap-2 text-xs sm:text-sm py-2.5 px-5 shadow-md hover:shadow-lg transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Chatbot Fácil</span>
          </button>
        </div>
      </div>

      {/* Quick Start Templates Cards (Top Banner) */}
      <div className="card-static p-5 sm:p-6 bg-gradient-to-r from-monte-verde/5 via-white to-monte-azul/5 border border-monte-verde/15">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold font-display text-monte-azul flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-monte-verde" /> Modelos Rápidos para Começar
            </h3>
            <p className="text-xs text-monte-sereno mt-0.5">
              Escolha um modelo pré-configurado e ative seu robô em menos de 1 minuto
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BOT_TEMPLATES.map(template => {
            const Icon = template.icon;
            return (
              <div
                key={template.id}
                onClick={() => openWizardWithTemplate(template.id)}
                className="group relative bg-white/90 hover:bg-white p-4 rounded-3xl border border-monte-sereno/20 hover:border-monte-verde/40 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${template.iconBg} shadow-xs`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${template.badgeColor}`}>
                      {template.badge}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-monte-azul group-hover:text-monte-verde transition-colors">
                    {template.title}
                  </h4>
                  <p className="text-xs text-monte-sereno mt-1 line-clamp-2 leading-relaxed">
                    {template.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-monte-sereno/10 flex items-center justify-between text-xs font-semibold text-monte-verde">
                  <span>Usar Modelo</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Existing Chatbots List */}
      <div className="space-y-4">
        {chatbots.map(bot => (
          <div key={bot.id} className="card-static overflow-hidden shadow-xs hover:shadow-md transition-all">
            {/* Bot Header Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 gap-3 hover:bg-monte-areiaSecao/30 transition-colors">
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-xs flex-shrink-0 transition-all ${
                    bot.isActive
                      ? 'bg-gradient-to-br from-monte-verde to-monte-azul text-white'
                      : 'bg-monte-sereno/20 text-monte-sereno'
                  }`}
                >
                  <Bot className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold font-display text-monte-azul text-base truncate">{bot.name}</h3>
                    <span className={`badge text-[10px] ${bot.isActive ? 'badge-green' : 'badge-gray'}`}>
                      {bot.isActive ? 'Ativo' : 'Pausado'}
                    </span>
                    {bot.useAi && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-2xs">
                        <Sparkles className="w-3 h-3" /> IA Gemini Ativa
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-monte-sereno flex-wrap">
                    {bot.whatsappAccount ? (
                      <span className="flex items-center gap-1 font-medium text-monte-azul bg-monte-areiaSecao px-2 py-0.5 rounded-md">
                        <Smartphone className="w-3 h-3 text-monte-verde" /> {bot.whatsappAccount.name}
                      </span>
                    ) : (
                      <span className="text-amber-600">Sem WhatsApp vinculado</span>
                    )}
                    <span>·</span>
                    <span>{bot.autoReplies.length} regra(s) de resposta</span>
                  </div>
                </div>
              </div>

              {/* Bot Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-monte-sereno/10">
                {/* AI Toggle Button */}
                <button
                  onClick={() => handleToggleAi(bot.id, bot.useAi)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    bot.useAi
                      ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                      : 'bg-monte-areiaSecao/80 text-monte-sereno border-monte-sereno/20 hover:text-monte-azul'
                  }`}
                  title={bot.useAi ? 'Clique para desativar a IA do Gemini' : 'Clique para ativar a IA do Gemini neste bot'}
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  <span>{bot.useAi ? 'IA Ligada' : 'Ligar IA'}</span>
                </button>

                {/* Status Toggle Button */}
                <button
                  onClick={() => handleToggle(bot.id)}
                  className={`p-2 rounded-xl border transition-colors ${
                    bot.isActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-monte-areiaSecao/80 text-monte-sereno border-monte-sereno/20'
                  }`}
                  title={bot.isActive ? 'Pausar Chatbot' : 'Ativar Chatbot'}
                >
                  {bot.isActive ? <ToggleRight className="w-5 h-5 text-emerald-600" /> : <ToggleLeft className="w-5 h-5" />}
                </button>

                {/* Expand Button */}
                <button
                  onClick={() => setExpandedId(expandedId === bot.id ? null : bot.id)}
                  className="flex items-center gap-1 text-xs font-medium px-3 py-2 rounded-xl bg-monte-areiaSecao hover:bg-monte-verde/15 text-monte-azul hover:text-monte-verde transition-colors border border-monte-sereno/20"
                >
                  <span>{expandedId === bot.id ? 'Ocultar Detalhes' : 'Ver Respostas'}</span>
                  {expandedId === bot.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {/* Delete Button */}
                <button
                  onClick={() => handleDelete(bot.id, bot.name)}
                  className="p-2 rounded-xl text-monte-sereno hover:bg-red-50 hover:text-red-600 transition-colors border border-transparent hover:border-red-200"
                  title="Excluir Chatbot"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Expanded Bot Details */}
            {expandedId === bot.id && (
              <div className="border-t border-monte-sereno/15 p-4 sm:p-6 bg-monte-areiaSecao/30 space-y-5 animate-in fade-in duration-150">
                {/* Greeting & Fallback Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl p-3.5 border border-monte-sereno/15 shadow-2xs">
                    <p className="text-[10px] font-bold text-monte-sereno uppercase tracking-wider mb-1">
                      Mensagem de Saudação (Boas-Vindas)
                    </p>
                    <p className="text-xs text-monte-azul leading-relaxed whitespace-pre-line">
                      {bot.greetingMessage || <span className="text-monte-sereno/60 italic">Nenhuma saudação configurada</span>}
                    </p>
                  </div>

                  <div className="bg-white rounded-2xl p-3.5 border border-monte-sereno/15 shadow-2xs">
                    <p className="text-[10px] font-bold text-monte-sereno uppercase tracking-wider mb-1">
                      Mensagem de Fallback (Quando não entender)
                    </p>
                    <p className="text-xs text-monte-azul leading-relaxed whitespace-pre-line">
                      {bot.fallbackMessage || (bot.useAi ? 'A IA do Gemini assumirá respostas quando não houver regra específica.' : <span className="text-monte-sereno/60 italic">Nenhum fallback configurado</span>)}
                    </p>
                  </div>
                </div>

                {/* Rules Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-monte-azul uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-monte-verde" />
                      Regras de Resposta Automática ({bot.autoReplies.length})
                    </h4>
                    <button
                      onClick={() => setNewReplyForm({ botId: bot.id, trigger: '', reply: '' })}
                      className="text-xs font-semibold text-monte-verde hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Adicionar Resposta Rápida
                    </button>
                  </div>

                  {/* Form to add quick reply */}
                  {newReplyForm.botId === bot.id && (
                    <div className="bg-white p-4 rounded-2xl border border-monte-verde/30 shadow-xs mb-3 space-y-3">
                      <p className="text-xs font-bold text-monte-azul">Nova Resposta Automática</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-monte-sereno mb-1">Se o cliente disser (palavra-chave):</label>
                          <input
                            type="text"
                            placeholder="Ex: planos, tabela, preço..."
                            value={newReplyForm.trigger}
                            onChange={e => setNewReplyForm({ ...newReplyForm, trigger: e.target.value })}
                            className="input-rect text-xs py-2"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-monte-sereno mb-1">O robô responderá com:</label>
                          <input
                            type="text"
                            placeholder="Ex: Nossos planos de saúde contam com ampla cobertura..."
                            value={newReplyForm.reply}
                            onChange={e => setNewReplyForm({ ...newReplyForm, reply: e.target.value })}
                            className="input-rect text-xs py-2"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setNewReplyForm({ botId: null, trigger: '', reply: '' })}
                          className="btn-secondary text-xs py-1.5 px-3"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleQuickAddReply(bot.id)}
                          disabled={!newReplyForm.trigger.trim() || !newReplyForm.reply.trim()}
                          className="btn-primary text-xs py-1.5 px-4"
                        >
                          Salvar Resposta
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Rules list */}
                  <div className="space-y-2">
                    {bot.autoReplies.map((rule, idx) => (
                      <div key={rule.id || idx} className="bg-white rounded-2xl border border-monte-sereno/15 p-3.5 shadow-2xs">
                        {editingReplyId === rule.id ? (
                          <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-bold text-monte-sereno uppercase mb-1">Quando disser:</label>
                                <input
                                  type="text"
                                  value={editForm.trigger}
                                  onChange={e => setEditForm({ ...editForm, trigger: e.target.value })}
                                  className="input-rect text-xs py-1.5"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-monte-sereno uppercase mb-1">Responder com:</label>
                                <input
                                  type="text"
                                  value={editForm.reply}
                                  onChange={e => setEditForm({ ...editForm, reply: e.target.value })}
                                  className="input-rect text-xs py-1.5"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingReplyId(null)} className="btn-secondary text-xs py-1 px-3">Cancelar</button>
                              <button onClick={() => handleUpdateReply(rule.id!)} className="btn-primary text-xs py-1 px-4">Salvar</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="badge badge-blue text-[10px] py-0.5">Se disser</span>
                                <span className="text-xs font-bold text-monte-azul truncate">"{rule.trigger}"</span>
                              </div>
                              <p className="text-xs text-monte-sereno pl-2 border-l-2 border-monte-verde/30 ml-1 leading-relaxed">
                                {rule.reply}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => {
                                  setEditingReplyId(rule.id!);
                                  setEditForm({ triggerType: rule.triggerType, trigger: rule.trigger, reply: rule.reply });
                                }}
                                className="p-1.5 text-monte-sereno hover:text-monte-azul rounded-lg hover:bg-monte-areiaSecao"
                                title="Editar"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteReply(rule.id!)}
                                className="p-1.5 text-monte-sereno hover:text-red-600 rounded-lg hover:bg-red-50"
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
                      <div className="bg-white/60 rounded-2xl p-6 text-center border border-monte-sereno/15">
                        <p className="text-xs text-monte-sereno">
                          {bot.useAi
                            ? 'Este chatbot está utilizando a IA do Gemini para responder livremente. Você também pode adicionar respostas específicas acima!'
                            : 'Nenhuma regra de resposta configurada ainda.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {chatbots.length === 0 && (
          <div className="card-static p-12 text-center">
            <div className="w-16 h-16 rounded-3xl bg-monte-verde/10 text-monte-verde flex items-center justify-center mx-auto mb-4">
              <Bot className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold font-display text-monte-azul mb-1">Nenhum Chatbot Criado Ainda</h3>
            <p className="text-xs sm:text-sm text-monte-sereno max-w-md mx-auto mb-6">
              Comece agora escolhendo um dos nossos modelos inteligentes para atender seus clientes automaticamente 24 horas por dia.
            </p>
            <button
              onClick={() => openWizardWithTemplate('ai-gemini')}
              className="btn-primary inline-flex items-center gap-2 text-sm py-2.5 px-6"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Meu Primeiro Chatbot</span>
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* GUIDED CHATBOT CREATION WIZARD (SUPER EASY & INTUITIVE) */}
      {/* ========================================================================= */}
      {showWizard && (
        <div className="fixed inset-0 z-50 bg-monte-azul/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto" onClick={() => setShowWizard(false)}>
          <div
            className="bg-white rounded-4xl w-full max-w-4xl my-auto shadow-2xl border border-monte-sereno/15 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* Wizard Header with Steps */}
            <div className="px-6 py-4 border-b border-monte-sereno/15 bg-monte-areiaSecao/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-monte-verde/15 text-monte-verde flex items-center justify-center flex-shrink-0">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-display text-monte-azul">Criar Novo Chatbot</h3>
                  <p className="text-[11px] text-monte-sereno">Configure em 3 passos simples</p>
                </div>
              </div>

              {/* Steps Indicator */}
              <div className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${wizardStep === 1 ? 'bg-monte-verde text-white' : 'bg-monte-areiaSecao text-monte-azul'}`}>
                  <span>1</span>
                  <span className="hidden sm:inline">Modelo & Conta</span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${wizardStep === 2 ? 'bg-monte-verde text-white' : 'bg-monte-areiaSecao text-monte-azul'}`}>
                  <span>2</span>
                  <span className="hidden sm:inline">Respostas & IA</span>
                </div>
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${wizardStep === 3 ? 'bg-monte-verde text-white' : 'bg-monte-areiaSecao text-monte-azul'}`}>
                  <span>3</span>
                  <span className="hidden sm:inline">Prévia no WhatsApp</span>
                </div>
              </div>

              <button
                onClick={() => setShowWizard(false)}
                className="p-1.5 text-monte-sereno hover:text-monte-azul rounded-full hover:bg-monte-areiaSecao"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Wizard Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* STEP 1: Choose Template, Name and WhatsApp */}
              {wizardStep === 1 && (
                <div className="space-y-6 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-xs font-bold text-monte-azul uppercase tracking-wider mb-2">
                      Passo 1: Escolha o modelo que melhor atende seu objetivo
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {BOT_TEMPLATES.map(template => {
                        const Icon = template.icon;
                        const isSelected = selectedTemplate === template.id;

                        return (
                          <div
                            key={template.id}
                            onClick={() => handleSelectTemplate(template.id)}
                            className={`p-4 rounded-3xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'border-monte-verde bg-monte-verde/5 ring-2 ring-monte-verde/20 shadow-xs'
                                : 'border-monte-sereno/20 hover:border-monte-sereno/40 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${template.iconBg}`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <h4 className="text-sm font-bold text-monte-azul">{template.title}</h4>
                              </div>
                              {isSelected ? (
                                <div className="w-5 h-5 rounded-full bg-monte-verde text-white flex items-center justify-center">
                                  <Check className="w-3 h-3" />
                                </div>
                              ) : (
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${template.badgeColor}`}>
                                  {template.badge}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-monte-sereno leading-relaxed">{template.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Name and WhatsApp Account */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-monte-sereno/15">
                    <div>
                      <label className="block text-xs font-bold text-monte-azul uppercase tracking-wider mb-1.5">
                        Nome do Chatbot
                      </label>
                      <input
                        type="text"
                        className="input text-sm"
                        placeholder="Ex: Assistente de Planos de Saúde"
                        value={botName}
                        onChange={e => setBotName(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-monte-azul uppercase tracking-wider mb-1.5">
                        Em qual WhatsApp este robô vai funcionar?
                      </label>
                      {accounts.length === 0 ? (
                        <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                          Nenhum WhatsApp conectado. Conecte um aparelho em "WhatsApps" primeiro.
                        </div>
                      ) : (
                        <select
                          className="input text-sm"
                          value={botAccount}
                          onChange={e => setBotAccount(e.target.value)}
                        >
                          <option value="">Selecione uma conta...</option>
                          {accounts.map(acc => (
                            <option key={acc.id} value={acc.id}>
                              {acc.name} {acc.phone ? `(${acc.phone})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Configure AI & Simple Rules */}
              {wizardStep === 2 && (
                <div className="space-y-5 animate-in fade-in duration-150">
                  {/* AI Gemini Banner Toggle */}
                  <div
                    onClick={() => setBotUseAi(!botUseAi)}
                    className={`p-4 rounded-3xl border cursor-pointer transition-all ${
                      botUseAi
                        ? 'bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50/40 border-purple-300 ring-2 ring-purple-400/20'
                        : 'bg-monte-areiaSecao/40 border-monte-sereno/20 hover:border-monte-sereno/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${botUseAi ? 'bg-purple-600 text-white' : 'bg-monte-sereno/20 text-monte-sereno'}`}>
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-monte-azul flex items-center gap-1.5">
                            IA Gemini — Assistente Inteligente e Autônomo
                            {botUseAi && <span className="badge badge-purple text-[10px]">Ativado</span>}
                          </h4>
                          <p className="text-xs text-monte-sereno mt-1 leading-relaxed">
                            Quando ativada, a IA responde perguntas dos clientes sobre seguros e planos de saúde com linguagem natural, cordial e consultiva.
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0 pt-1">
                        {botUseAi ? <ToggleRight className="w-7 h-7 text-purple-600" /> : <ToggleLeft className="w-7 h-7 text-monte-sereno" />}
                      </div>
                    </div>
                  </div>

                  {/* Greeting Message */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-monte-azul uppercase tracking-wider">
                        Mensagem de Saudação (Boas-Vindas)
                      </label>
                      <span className="text-[11px] text-monte-sereno">Enviada ao iniciar o contato</span>
                    </div>
                    <textarea
                      rows={3}
                      className="input-rect text-xs sm:text-sm"
                      placeholder="Ex: Olá! Seja bem-vindo à Monteiro Corretora..."
                      value={botGreeting}
                      onChange={e => setBotGreeting(e.target.value)}
                    />
                  </div>

                  {/* Simple Rules Builder */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <label className="text-xs font-bold text-monte-azul uppercase tracking-wider block">
                          Respostas Específicas por Palavra-Chave
                        </label>
                        <span className="text-[11px] text-monte-sereno">
                          Se o cliente falar uma dessas palavras, o bot responderá exatamente o que você definir:
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBotRules([...botRules, { triggerType: 'contains', trigger: '', reply: '' }])}
                        className="text-xs text-monte-verde hover:underline font-bold flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar Palavra
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-56 overflow-y-auto p-1">
                      {botRules.map((rule, idx) => (
                        <div key={idx} className="bg-monte-areiaSecao/60 p-3 rounded-2xl border border-monte-sereno/20 flex flex-col sm:flex-row items-center gap-2">
                          <div className="w-full sm:w-1/3">
                            <span className="text-[10px] text-monte-sereno font-semibold block mb-0.5">Se disser:</span>
                            <input
                              type="text"
                              placeholder="Ex: preço, 1, planos..."
                              value={rule.trigger}
                              onChange={e => {
                                const copy = [...botRules];
                                copy[idx].trigger = e.target.value;
                                setBotRules(copy);
                              }}
                              className="input-rect text-xs py-1.5"
                            />
                          </div>
                          <div className="w-full sm:flex-1">
                            <span className="text-[10px] text-monte-sereno font-semibold block mb-0.5">O robô responde:</span>
                            <input
                              type="text"
                              placeholder="Texto que o cliente receberá..."
                              value={rule.reply}
                              onChange={e => {
                                const copy = [...botRules];
                                copy[idx].reply = e.target.value;
                                setBotRules(copy);
                              }}
                              className="input-rect text-xs py-1.5"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setBotRules(botRules.filter((_, i) => i !== idx))}
                            className="p-1.5 text-monte-sereno hover:text-red-600 rounded-lg hover:bg-red-50 self-end sm:self-center mt-1 sm:mt-4"
                            title="Remover"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: WhatsApp Simulator & Preview */}
              {wizardStep === 3 && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div>
                    <h4 className="text-sm font-bold text-monte-azul font-display">
                      Simulador de WhatsApp em Tempo Real
                    </h4>
                    <p className="text-xs text-monte-sereno mt-0.5">
                      Veja exatamente como seu cliente vai interagir com seu robô antes de salvar. Você pode testar digitando abaixo!
                    </p>
                  </div>

                  {/* Smartphone Mockup */}
                  <div className="max-w-md mx-auto bg-[#e5ddd5] rounded-3xl border-4 border-monte-azul/80 shadow-2xl overflow-hidden flex flex-col h-96">
                    {/* WhatsApp Chat Header */}
                    <div className="bg-monte-verde px-4 py-2.5 flex items-center gap-3 text-white">
                      <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold text-xs">
                        <Bot className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{botName || 'Monteiro Atendimento'}</p>
                        <p className="text-[10px] text-emerald-200">Online comercial</p>
                      </div>
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                        Preview
                      </span>
                    </div>

                    {/* Messages Scroll Area */}
                    <div className="flex-1 p-3 overflow-y-auto space-y-2 text-xs">
                      {simulatedMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`flex flex-col ${msg.from === 'client' ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] p-2.5 rounded-2xl shadow-2xs whitespace-pre-line leading-relaxed ${
                              msg.from === 'client'
                                ? 'bg-[#dcf8c6] text-monte-azul rounded-tr-none'
                                : 'bg-white text-monte-azul rounded-tl-none border border-black/5'
                            }`}
                          >
                            <p>{msg.text}</p>
                            <span className="block text-[9px] text-monte-sereno text-right mt-1">
                              {msg.time} {msg.from === 'client' && '✓✓'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Chat Input */}
                    <div className="bg-[#f0f0f0] p-2 flex items-center gap-2 border-t border-monte-sereno/20">
                      <input
                        type="text"
                        placeholder="Digite uma mensagem para testar..."
                        value={previewTestInput}
                        onChange={e => setPreviewTestInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendSimulatorMessage()}
                        className="flex-1 bg-white text-xs px-3 py-2 rounded-full border border-monte-sereno/20 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleSendSimulatorMessage}
                        className="w-8 h-8 rounded-full bg-monte-verde text-white flex items-center justify-center flex-shrink-0 hover:bg-monte-azul transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Footer Navigation */}
            <div className="px-6 py-4 border-t border-monte-sereno/15 bg-monte-areiaSecao/40 flex items-center justify-between">
              <div>
                {wizardStep > 1 && (
                  <button
                    type="button"
                    onClick={() => setWizardStep((wizardStep - 1) as any)}
                    className="btn-secondary text-xs sm:text-sm py-2 px-4 flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" /> Voltar
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowWizard(false)}
                  className="btn-secondary text-xs sm:text-sm py-2 px-4"
                >
                  Cancelar
                </button>

                {wizardStep < 3 ? (
                  <button
                    type="button"
                    disabled={wizardStep === 1 && (!botName.trim() || !botAccount)}
                    onClick={() => setWizardStep((wizardStep + 1) as any)}
                    className="btn-primary text-xs sm:text-sm py-2 px-5 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    Avançar <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateBot}
                    disabled={creating || !botName.trim() || !botAccount}
                    className="btn-primary text-xs sm:text-sm py-2.5 px-6 flex items-center gap-2 bg-monte-verde hover:bg-monte-azul"
                  >
                    {creating ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    {creating ? 'Salvando...' : 'Salvar e Ativar Chatbot'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
