import { useState, useEffect, useCallback, useMemo } from 'react';
import { dashboardApi } from '../lib/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import {
  Smartphone, MessageSquare, Mail, TrendingUp, ArrowRight,
  ShieldCheck, AlertCircle, Clock, Zap, CheckCircle2,
  ExternalLink, Sparkles, UserCheck, MessageSquareQuote,
  Activity, RefreshCw, Quote, Smile, Lock, Users, RotateCw, Heart,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

/** Foto de perfil direta do WhatsApp, com fallback para inicial */
function ConvAvatar({ contactId, name, phone }: { contactId?: string; name?: string | null; phone?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!failed && contactId) {
    return (
      <img
        src={`/api/contacts/${contactId}/avatar`}
        alt=""
        onError={() => setFailed(true)}
        className="w-11 h-11 rounded-2xl object-cover flex-shrink-0 shadow-xs border border-monte-sereno/15 bg-monte-sereno/10"
      />
    );
  }
  return (
    <div className="w-11 h-11 bg-gradient-to-br from-monte-verde to-monte-azul rounded-2xl flex items-center justify-center text-sm font-bold text-white shadow-xs">
      {(name || phone || '?')[0].toUpperCase()}
    </div>
  );
}

interface Stats {
  connectedCount: number;
  disconnectedCount: number;
  totalConversations: number;
  unreadMessages: number;
  totalMessages: number;
  messagesToday: number;
  recentMessages: any[];
  recentConversations: any[];
  unreadConversations?: any[];
  messagesPerAccount: any[];
  assignedConversations?: any[];
  assignedCount?: number;
}

const MOTIVATIONAL_QUOTES = [
  {
    quote: "A excelência não é um ato isolado, mas um hábito construído a cada mensagem e atenção dada ao cliente.",
    author: "Monteiro Seguros",
    tag: "Excelência & Cuidado",
  },
  {
    quote: "O segredo do sucesso no atendimento é ouvir com empatia, responder com agilidade e cuidar de verdade.",
    author: "Filosofia Monteiro",
    tag: "Empatia no Atendimento",
  },
  {
    quote: "Grandes dias começam com pequenas atitudes: um sorriso na voz, uma resposta rápida e o desejo genuíno de ajudar.",
    author: "Inspiração Diária",
    tag: "Energia Positiva",
  },
  {
    quote: "Proteger o que as pessoas têm de mais valioso é o nosso maior propósito. Faça a diferença hoje!",
    author: "Cultura Monteiro",
    tag: "Propósito & Segurança",
  },
  {
    quote: "O sucesso é a soma de pequenos esforços repetidos com carinho e disciplina dia após dia.",
    author: "Robert Collier",
    tag: "Constância & Foco",
  },
  {
    quote: "Trabalho em equipe é a união de forças que transforma metas desafiadoras em conquistas compartilhadas.",
    author: "Equipe Monteiro",
    tag: "União & Colaboração",
  },
  {
    quote: "A confiança é a maior apólice que um cliente pode ter. Conquiste-a em cada detalhe do seu atendimento.",
    author: "Monteiro Conecta",
    tag: "Confiança & Relacionamento",
  },
  {
    quote: "Não espere o dia ser perfeito para fazer o seu melhor. Crie oportunidades extraordinárias a cada conversa.",
    author: "Inspiração Diária",
    tag: "Atitude Vencedora",
  },
  {
    quote: "A melhor maneira de começar o dia é com foco, gratidão e a certeza de que seu trabalho impacta vidas.",
    author: "Monteiro Seguros",
    tag: "Foco & Gratidão",
  },
  {
    quote: "Cada cliente atendido hoje é uma família que confia na nossa proteção. Dê o seu melhor!",
    author: "Filosofia Monteiro",
    tag: "Compromisso",
  },
  {
    quote: "A persistência aliada à gentileza abre portas que a pressa costuma fechar. Tenha um dia incrível!",
    author: "Inspiração Diária",
    tag: "Gentileza & Persistência",
  },
  {
    quote: "Você é parte fundamental do sucesso da Monteiro Seguros. Que seu dia seja produtivo, leve e vitorioso!",
    author: "Cultura Monteiro",
    tag: "Reconhecimento & Força",
  },
];

interface TeamMood {
  userId: string;
  username: string;
  moodId: string;
  moodLabel: string;
  emoji: string;
  updatedAt: string;
}

const MOOD_OPTIONS = [
  {
    id: 'motivado',
    emoji: '🔥',
    label: 'Motivado(a)',
    desc: 'Com energia e foco total',
    badgeClass: 'bg-amber-50/80 text-amber-800 border-amber-200 hover:border-amber-400 hover:bg-amber-100/70',
    activeClass: 'bg-gradient-to-br from-amber-500 to-orange-600 text-white border-amber-500 shadow-md ring-2 ring-amber-400/40',
    feedback: 'Sensacional! Que essa energia e entusiasmo contagiem cada cliente e atendimento hoje! 🔥',
  },
  {
    id: 'bem',
    emoji: '☀️',
    label: 'Bem & Disposto(a)',
    desc: 'Equilíbrio e positividade',
    badgeClass: 'bg-sky-50/80 text-sky-800 border-sky-200 hover:border-sky-400 hover:bg-sky-100/70',
    activeClass: 'bg-gradient-to-br from-sky-500 to-blue-600 text-white border-sky-500 shadow-md ring-2 ring-sky-400/40',
    feedback: 'Maravilha! Tenha um expediente brilhante, leve e muito produtivo! ☀️',
  },
  {
    id: 'na_luta',
    emoji: '☕',
    label: 'Focado(a) no Café',
    desc: 'Na luta e determinado(a)',
    badgeClass: 'bg-amber-50/80 text-amber-900 border-amber-300/80 hover:border-amber-400 hover:bg-amber-100/70',
    activeClass: 'bg-gradient-to-br from-amber-700 to-amber-900 text-white border-amber-700 shadow-md ring-2 ring-amber-600/40',
    feedback: 'Bora com tudo! Um café quentinho e muita determinação para superar cada desafio! ☕',
  },
  {
    id: 'tranquilo',
    emoji: '🧘',
    label: 'Tranquilo(a)',
    desc: 'Paciência e serenidade',
    badgeClass: 'bg-teal-50/80 text-teal-800 border-teal-200 hover:border-teal-400 hover:bg-teal-100/70',
    activeClass: 'bg-gradient-to-br from-monte-verde to-emerald-700 text-white border-monte-verde shadow-md ring-2 ring-emerald-400/40',
    feedback: 'Paz e calma são o grande segredo para as melhores negociações e conexões com o cliente! 🧘',
  },
  {
    id: 'correria',
    emoji: '⚡',
    label: 'Na Correria',
    desc: 'Muitas demandas e propostas',
    badgeClass: 'bg-purple-50/80 text-purple-800 border-purple-200 hover:border-purple-400 hover:bg-purple-100/70',
    activeClass: 'bg-gradient-to-br from-purple-600 to-indigo-700 text-white border-purple-600 shadow-md ring-2 ring-purple-400/40',
    feedback: 'Força no funil! Vá com calma, um cliente de cada vez, e conte sempre com o apoio da equipe! ⚡',
  },
  {
    id: 'cansado',
    emoji: '🪫',
    label: 'Desafiador / Cansado(a)',
    desc: 'Precisando de um respiro',
    badgeClass: 'bg-rose-50/80 text-rose-800 border-rose-200 hover:border-rose-400 hover:bg-rose-100/70',
    activeClass: 'bg-gradient-to-br from-rose-500 to-rose-700 text-white border-rose-500 shadow-md ring-2 ring-rose-400/40',
    feedback: 'Respire fundo e faça pequenas pausas para beber água! Seu bem-estar é prioridade para todos nós. 💚',
  },
];

export default function DashboardPage() {
  const { socket } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'recent' | 'unread'>('recent');
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const loadStats = useCallback(async () => {
    try {
      const data = await dashboardApi.stats();
      setStats(data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.warn('Erro ao carregar estatísticas do dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 20000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // Atualizações em tempo real via Socket
  useEffect(() => {
    if (!socket) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadStats();
      }, 1000);
    };

    socket.on('message:new', onUpdate);
    socket.on('message:sent', onUpdate);
    socket.on('whatsapp:status', onUpdate);
    socket.on('whatsapp:connected', onUpdate);
    socket.on('whatsapp:disconnected', onUpdate);
    socket.on('conversation:read', onUpdate);
    socket.on('history:imported', onUpdate);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      socket.off('message:new', onUpdate);
      socket.off('message:sent', onUpdate);
      socket.off('whatsapp:status', onUpdate);
      socket.off('whatsapp:connected', onUpdate);
      socket.off('whatsapp:disconnected', onUpdate);
      socket.off('conversation:read', onUpdate);
      socket.off('history:imported', onUpdate);
    };
  }, [socket, loadStats]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }, []);

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }, []);

  // 🌟 Chave do dia atual (YYYY-MM-DD)
  const todayKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // Frase do dia calculada com base no dia do ano
  const defaultQuoteIndex = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    return Math.abs(dayOfYear) % MOTIVATIONAL_QUOTES.length;
  }, []);

  const [quoteIndex, setQuoteIndex] = useState<number>(defaultQuoteIndex);

  // Check-in de Sentimento / Humor dos funcionários internos
  // 1. Inicializa o humor direto do localStorage para persistência imediata mesmo com refresh/F5
  const [selectedMood, setSelectedMood] = useState<string | null>(() => {
    try {
      const now = new Date();
      const currentDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const savedRaw = localStorage.getItem('monteiro_user_mood_today');
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed?.date === currentDay && parsed?.moodId) {
          return parsed.moodId;
        }
      }
    } catch {
      // fallback
    }
    return null;
  });

  const [teamMoods, setTeamMoods] = useState<TeamMood[]>([]);

  // Sincroniza sentimentos da equipe via API e recupera o sentimento do usuário atual
  const syncMoodsFromApi = useCallback(async () => {
    try {
      const res = await dashboardApi.getMoods();
      const list: TeamMood[] = Array.isArray(res) ? res : (Array.isArray((res as any)?.data) ? (res as any).data : []);
      setTeamMoods(list);

      // Se temos o usuário autenticado, verifica se ele já registrou o humor hoje no backend
      if (user && list.length > 0) {
        const myEntry = list.find(
          (m) => String(m.userId) === String(user.id) || m.username?.toLowerCase() === user.username?.toLowerCase()
        );
        if (myEntry?.moodId) {
          setSelectedMood(myEntry.moodId);
          try {
            localStorage.setItem(
              'monteiro_user_mood_today',
              JSON.stringify({
                date: todayKey,
                moodId: myEntry.moodId,
                userId: user.id,
                username: user.username,
              })
            );
          } catch {
            // ignore
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar status de humor da equipe:', err);
    }
  }, [todayKey, user]);

  useEffect(() => {
    syncMoodsFromApi();
  }, [syncMoodsFromApi]);

  // Monitora virada do dia para resetar automaticamente os sentimentos a cada novo dia
  useEffect(() => {
    const checkDay = () => {
      const now = new Date();
      const freshKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (freshKey !== todayKey) {
        setSelectedMood(null);
        localStorage.removeItem('monteiro_user_mood_today');
        syncMoodsFromApi();
      }
    };

    const interval = setInterval(checkDay, 30000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkDay();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [todayKey, syncMoodsFromApi]);

  // Sincroniza sentimentos da equipe via Socket em tempo real
  useEffect(() => {
    if (!socket) return;

    const handleInit = (moods: TeamMood[]) => {
      const list = Array.isArray(moods) ? moods : [];
      setTeamMoods(list);
      if (user) {
        const myEntry = list.find(
          (m) => String(m.userId) === String(user.id) || m.username?.toLowerCase() === user.username?.toLowerCase()
        );
        if (myEntry?.moodId) {
          setSelectedMood(myEntry.moodId);
        }
      }
    };

    const handleMoodUpdated = (updatedMood: TeamMood) => {
      setTeamMoods((prev) => {
        const filtered = prev.filter((m) => m.userId !== updatedMood.userId);
        return [updatedMood, ...filtered];
      });
      if (user && (String(updatedMood.userId) === String(user.id) || updatedMood.username?.toLowerCase() === user.username?.toLowerCase())) {
        setSelectedMood(updatedMood.moodId);
      }
    };

    socket.on('team:mood:init', handleInit);
    socket.on('team:mood:updated', handleMoodUpdated);

    return () => {
      socket.off('team:mood:init', handleInit);
      socket.off('team:mood:updated', handleMoodUpdated);
    };
  }, [socket, user]);

  const handleSelectMood = (moodId: string) => {
    const moodObj = MOOD_OPTIONS.find((m) => m.id === moodId);
    if (!moodObj) return;

    setSelectedMood(moodId);

    // Salva imediatamente no localStorage com persistência total para a data de hoje
    try {
      localStorage.setItem(
        'monteiro_user_mood_today',
        JSON.stringify({
          date: todayKey,
          moodId,
          userId: user?.id,
          username: user?.username,
          label: moodObj.label,
          emoji: moodObj.emoji,
          updatedAt: new Date().toISOString(),
        })
      );
    } catch {
      // ignore
    }

    const payload = {
      moodId,
      moodLabel: moodObj.label,
      emoji: moodObj.emoji,
    };

    if (socket && socket.connected) {
      socket.emit('user:mood:update', payload);
    }
    dashboardApi.updateMood(payload).catch(() => {});

    if (user) {
      const myEntry: TeamMood = {
        userId: String(user.id),
        username: user.username,
        moodId,
        moodLabel: moodObj.label,
        emoji: moodObj.emoji,
        updatedAt: new Date().toISOString(),
      };
      setTeamMoods((prev) => {
        const filtered = prev.filter((m) => m.userId !== String(user.id));
        return [myEntry, ...filtered];
      });
    }
  };

  const currentQuote = MOTIVATIONAL_QUOTES[quoteIndex % MOTIVATIONAL_QUOTES.length];
  const activeMoodObj = MOOD_OPTIONS.find((m) => m.id === selectedMood);

  if (loading) return <LoadingSkeleton />;

  const unreadConvs = stats?.unreadConversations || [];
  const recentConvs = stats?.recentConversations || [];
  const accounts = stats?.messagesPerAccount || [];

  const cards = [
    {
      label: isAdmin ? 'WhatsApps Conectados' : 'Meus Canais Ativos',
      value: stats?.connectedCount || 0,
      total: (stats?.connectedCount || 0) + (stats?.disconnectedCount || 0),
      subtitle: `${stats?.connectedCount || 0} de ${(stats?.connectedCount || 0) + (stats?.disconnectedCount || 0)} online`,
      icon: Smartphone,
      gradient: 'from-emerald-500 to-teal-700',
      badge: (stats?.connectedCount || 0) > 0 ? 'Conectado' : 'Atenção',
      badgeColor: (stats?.connectedCount || 0) > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800',
    },
    {
      label: isAdmin ? 'Conversas Abertas' : 'Minhas Conversas',
      value: stats?.totalConversations || 0,
      subtitle: 'Atendimentos em andamento',
      icon: MessageSquare,
      gradient: 'from-monte-azul to-sky-700',
      badge: 'Ativas',
      badgeColor: 'bg-blue-100 text-blue-800',
    },
    {
      label: 'Mensagens Não Lidas',
      value: stats?.unreadMessages || 0,
      subtitle: unreadConvs.length > 0 ? `${unreadConvs.length} cliente(s) aguardando` : 'Tudo em dia',
      icon: Mail,
      gradient: 'from-monte-terracota to-rose-600',
      badge: (stats?.unreadMessages || 0) > 0 ? 'Requer Ação' : 'Zerado',
      badgeColor: (stats?.unreadMessages || 0) > 0 ? 'bg-rose-100 text-rose-800 animate-pulse' : 'bg-emerald-100 text-emerald-800',
    },
    {
      label: 'Mensagens Hoje',
      value: stats?.messagesToday || 0,
      subtitle: 'Disparos e recebimentos',
      icon: TrendingUp,
      gradient: 'from-purple-600 to-indigo-700',
      badge: 'Hoje',
      badgeColor: 'bg-purple-100 text-purple-800',
    },
    {
      label: 'Total Armazenado',
      value: (stats?.totalMessages || 0).toLocaleString('pt-BR'),
      subtitle: 'Histórico na central',
      icon: Activity,
      gradient: 'from-slate-700 to-slate-900',
      badge: 'Base Segura',
      badgeColor: 'bg-slate-100 text-slate-800',
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header Executivo de Boas-Vindas */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-monte-azul via-[#0d2a45] to-monte-verde text-white shadow-xl relative overflow-hidden">
        {/* Efeito decorativo de fundo */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-white/5 blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 right-32 -mb-20 w-60 h-60 rounded-full bg-monte-verde/15 blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-white/90 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Painel Executivo • Monteiro Conecta</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black font-display tracking-tight text-white">
              {greeting}, <span className="text-emerald-300">{user?.username || 'Colaborador'}</span>!
            </h1>
            <p className="text-xs sm:text-sm text-slate-200 capitalize font-medium flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-monte-verde" /> {formattedDate}
            </p>
          </div>

          {/* Ações Rápidas */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => navigate('/conversations')}
              className="px-4 py-2.5 rounded-2xl bg-white text-monte-azul hover:bg-slate-50 font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <MessageSquare className="w-4 h-4 text-monte-verde" />
              <span>Abrir Conversas</span>
            </button>

            <button
              onClick={() => navigate('/mensagem')}
              className="px-4 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-semibold text-xs backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <MessageSquareQuote className="w-4 h-4 text-emerald-300" />
              <span>Mensagens Rápidas</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => navigate('/whatsapp')}
                className="px-4 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-semibold text-xs backdrop-blur-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-sky-300" />
                <span>WhatsApps</span>
              </button>
            )}

            <button
              onClick={() => loadStats()}
              title="Recarregar dados agora"
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 🌟 Painel Inspiracional & Bem-Estar da Equipe (Exclusivo Funcionários Internos) */}
      {user && (
        <div className="rounded-3xl bg-gradient-to-br from-white via-[#fcfbf9] to-[#f4f7f5] border border-monte-verde/20 shadow-md p-6 sm:p-7 space-y-6 relative overflow-hidden transition-all duration-300 hover:shadow-lg">
          {/* Efeitos decorativos de luz suave */}
          <div className="absolute top-0 right-0 w-72 h-72 bg-monte-verde/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-60 h-60 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

          {/* PARTE 1: Frase Motivacional do Dia */}
          <div className="relative z-10 space-y-3 pb-5 border-b border-monte-sereno/15">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-monte-verde/15 to-emerald-600/15 text-monte-verde text-xs font-black tracking-wide border border-monte-verde/25 shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5 text-monte-verde animate-pulse" />
                  <span>INSPIRAÇÃO DO DIA</span>
                </span>
                <span className="text-xs font-semibold text-monte-azul/80 bg-monte-azul/5 border border-monte-azul/10 px-3 py-0.5 rounded-full">
                  💡 {currentQuote.tag}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setQuoteIndex((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-monte-azul/70 hover:text-monte-verde bg-white hover:bg-monte-verde/10 border border-monte-sereno/20 hover:border-monte-verde/40 px-3 py-1.5 rounded-xl shadow-2xs transition-all cursor-pointer self-start sm:self-auto hover:scale-[1.02] active:scale-[0.98]"
                title="Sortear outra frase motivacional"
              >
                <RotateCw className="w-3.5 h-3.5 text-monte-verde" />
                <span>Outra frase</span>
              </button>
            </div>

            <div className="flex items-start gap-4 pt-1">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-monte-verde to-monte-azul text-white flex items-center justify-center shrink-0 shadow-md">
                <Quote className="w-6 h-6 text-white" />
              </div>
              <div className="space-y-1.5 flex-1">
                <blockquote className="text-sm sm:text-base font-semibold text-slate-800 leading-relaxed italic">
                  “{currentQuote.quote}”
                </blockquote>
                <p className="text-xs font-extrabold text-monte-verde flex items-center gap-2">
                  <span className="w-4 h-0.5 bg-monte-verde inline-block rounded-full" />
                  {currentQuote.author}
                </p>
              </div>
            </div>
          </div>

          {/* PARTE 2: Como você está se sentindo hoje? */}
          <div className="relative z-10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Smile className="w-5 h-5 text-monte-verde" />
                  <h3 className="text-sm sm:text-base font-black text-monte-azul">
                    Como você está se sentindo hoje, <span className="text-monte-verde">{user.username}</span>?
                  </h3>
                </div>
                <p className="text-xs text-monte-sereno mt-0.5">
                  Check-in diário de energia e humor da nossa equipe
                </p>
              </div>

              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 bg-white border border-slate-200/80 px-3 py-1 rounded-full shadow-2xs self-start sm:self-auto">
                <Lock className="w-3 h-3 text-slate-400" />
                <span>Espaço Interno da Equipe Monteiro</span>
              </div>
            </div>

            {/* Grid dos Cards de Sentimento */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {MOOD_OPTIONS.map((mood) => {
                const isSelected = selectedMood === mood.id;
                return (
                  <button
                    key={mood.id}
                    type="button"
                    onClick={() => handleSelectMood(mood.id)}
                    className={`p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2 group relative overflow-hidden ${
                      isSelected
                        ? `${mood.activeClass} shadow-md scale-[1.03]`
                        : `${mood.badgeClass} bg-white hover:bg-slate-50/80 hover:-translate-y-0.5 hover:shadow-xs`
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-2xl sm:text-3xl group-hover:scale-110 transition-transform duration-200">
                        {mood.emoji}
                      </span>
                      {isSelected ? (
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-slate-200 group-hover:bg-slate-300" />
                      )}
                    </div>
                    <div>
                      <p className={`text-xs font-bold leading-tight ${isSelected ? 'text-white font-extrabold' : 'text-slate-800'}`}>
                        {mood.label}
                      </p>
                      <p className={`text-[10px] mt-0.5 leading-tight font-medium ${isSelected ? 'text-white/90' : 'text-slate-500'}`}>
                        {mood.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Banner Positivo de Feedback Quando Selecionado */}
            {activeMoodObj && (
              <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50/60 to-white border border-emerald-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <span className="text-2xl p-2 rounded-xl bg-white shadow-2xs border border-emerald-100 shrink-0">
                    {activeMoodObj.emoji}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-900">
                        Seu sentimento de hoje: <strong className="text-emerald-700">{activeMoodObj.label}</strong>
                      </span>
                    </div>
                    <p className="text-xs font-medium text-emerald-800/90 mt-0.5">
                      {activeMoodObj.feedback}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Salvo para hoje</span>
                  </span>
                </div>
              </div>
            )}

            {/* Status Compartilhado da Equipe Hoje */}
            <div className="pt-3 border-t border-monte-sereno/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-extrabold text-monte-azul/80 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                  <Users className="w-3.5 h-3.5 text-monte-verde" />
                  <span>Equipe hoje ({teamMoods.length}):</span>
                </span>

                {teamMoods.length === 0 ? (
                  <span className="text-[11px] text-slate-400 italic">
                    Nenhum colega registrou ainda hoje. Seja o primeiro a inspirar o time!
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {teamMoods.map((tm) => {
                      const isMe = user && (tm.userId === String(user.id) || tm.username?.toLowerCase() === user.username?.toLowerCase());
                      return (
                        <span
                          key={tm.userId}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs border shadow-2xs transition-all ${
                            isMe
                              ? 'bg-gradient-to-r from-monte-verde/15 to-emerald-600/15 text-monte-verde border-monte-verde/30 font-bold'
                              : 'bg-white text-slate-700 border-slate-200/90 font-medium'
                          }`}
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                          <span>{isMe ? `${tm.username} (Você)` : tm.username}</span>
                          <span className="text-slate-300">|</span>
                          <span className="text-sm">{tm.emoji}</span>
                          <span className="text-[11px] font-semibold">{tm.moodLabel}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Cards em Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="p-5 rounded-3xl bg-white border border-monte-sereno/15 shadow-2xs hover:shadow-md hover:border-monte-verde/40 transition-all duration-200 group flex flex-col justify-between relative overflow-hidden"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${card.badgeColor}`}>
                {card.badge}
              </span>
              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform`}>
                <card.icon className="w-5 h-5" />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-monte-sereno">{card.label}</p>
              <p className="text-2xl sm:text-3xl font-black font-display text-monte-azul tracking-tight mt-0.5">
                {card.value}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 font-medium truncate">
                {card.subtitle}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Seção Principal de Conteúdo: 2 Colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Canais de WhatsApp (5 colunas) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-3xl border border-monte-sereno/15 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-monte-sereno/15 bg-monte-areiaSecao/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-monte-verde" />
                <h3 className="font-bold font-display text-monte-azul text-sm">
                  {isAdmin ? 'Canais WhatsApp Conectados' : 'Meus WhatsApps'}
                </h3>
              </div>
              {isAdmin && (
                <Link
                  to="/whatsapp"
                  className="text-xs font-bold text-monte-verde hover:text-emerald-700 flex items-center gap-1 transition-colors"
                >
                  Gerenciar <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>

            <div className="divide-y divide-monte-sereno/10">
              {accounts.map((acc: any) => {
                const isOnline = acc.status === 'CONNECTED';
                const isError = acc.status === 'ERROR';

                return (
                  <div
                    key={acc.id}
                    className="p-4 hover:bg-monte-areiaSecao/40 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white shrink-0 shadow-xs ${
                        isOnline ? 'bg-gradient-to-br from-emerald-500 to-teal-700' : 'bg-slate-400'
                      }`}>
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-monte-azul truncate">{acc.name}</p>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isOnline
                              ? 'bg-emerald-100 text-emerald-800'
                              : isError
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                            {isOnline ? 'Conectado' : isError ? 'Erro' : 'Desconectado'}
                          </span>
                        </div>
                        <p className="text-xs text-monte-sereno">
                          {acc._count?.conversations || 0} conversas ativas
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate('/conversations')}
                      className="p-2 rounded-xl bg-monte-areiaSecao/60 hover:bg-monte-verde/15 text-monte-azul hover:text-monte-verde transition-colors cursor-pointer shrink-0"
                      title="Abrir no chat"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              {!accounts.length && (
                <div className="px-6 py-12 text-center text-monte-sereno space-y-3">
                  <div className="w-12 h-12 rounded-full bg-monte-areiaSecao/60 flex items-center justify-center mx-auto text-monte-sereno">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-monte-azul">Nenhum canal ativo no momento</p>
                    <p className="text-xs text-monte-sereno mt-0.5">
                      {isAdmin ? 'Conecte um novo número de WhatsApp para iniciar os atendimentos.' : 'Nenhum WhatsApp atribuído ao seu usuário. Solicite liberação ao supervisor.'}
                    </p>
                  </div>
                  {isAdmin && (
                    <Link
                      to="/whatsapp"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-monte-verde text-white font-bold text-xs shadow-xs hover:bg-emerald-700 transition-colors"
                    >
                      Conectar WhatsApp
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Painel de Atendimento (7 colunas) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-3xl border border-monte-sereno/15 shadow-2xs overflow-hidden">
            {/* Header com Abas: Recentes vs Não Lidas */}
            <div className="px-6 py-3 border-b border-monte-sereno/15 bg-monte-areiaSecao/30 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('recent')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'recent'
                      ? 'bg-monte-azul text-white shadow-2xs'
                      : 'text-monte-sereno hover:text-monte-azul hover:bg-white/60'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Conversas Recentes</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                    {recentConvs.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('unread')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'unread'
                      ? 'bg-monte-terracota text-white shadow-2xs'
                      : 'text-monte-sereno hover:text-monte-azul hover:bg-white/60'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Aguardando Resposta</span>
                  {unreadConvs.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/30 font-extrabold animate-pulse">
                      {unreadConvs.length}
                    </span>
                  )}
                </button>
              </div>

              <Link
                to="/conversations"
                className="text-xs font-bold text-monte-verde hover:text-emerald-700 flex items-center gap-1 transition-colors"
              >
                Ver Todas <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Conteúdo da Aba */}
            <div className="divide-y divide-monte-sereno/10">
              {activeTab === 'recent' ? (
                recentConvs.length > 0 ? (
                  recentConvs.slice(0, 8).map((conv: any) => (
                    <div
                      key={conv.id}
                      onClick={() => navigate('/conversations')}
                      className="p-4 flex items-center gap-3.5 hover:bg-monte-areiaSecao/40 transition-colors cursor-pointer group"
                    >
                      <ConvAvatar
                        contactId={conv.contact?.id}
                        name={conv.contact?.name}
                        phone={conv.contact?.phone}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-monte-azul group-hover:text-monte-verde transition-colors truncate">
                            {conv.contact?.name || conv.contact?.phone || 'Contato'}
                          </p>
                          {conv.unreadCount > 0 && (
                            <span className="bg-monte-terracota text-white text-[11px] rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5 font-bold shadow-xs">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-monte-sereno truncate mt-0.5">
                          {conv.lastMessage || 'Sem mensagens recentes'}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-monte-sereno group-hover:text-monte-verde group-hover:translate-x-1 transition-all shrink-0" />
                    </div>
                  ))
                ) : (
                  <div className="px-6 py-12 text-center text-monte-sereno">
                    <p className="text-sm font-medium">Nenhuma conversa recente encontrada.</p>
                  </div>
                )
              ) : (
                unreadConvs.length > 0 ? (
                  unreadConvs.slice(0, 8).map((conv: any) => (
                    <div
                      key={conv.id}
                      onClick={() => navigate('/conversations')}
                      className="p-4 flex items-center gap-3.5 hover:bg-rose-50/50 transition-colors cursor-pointer group"
                    >
                      <ConvAvatar
                        contactId={conv.contact?.id}
                        name={conv.contact?.name}
                        phone={conv.contact?.phone}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-monte-azul group-hover:text-monte-terracota transition-colors truncate">
                            {conv.contact?.name || conv.contact?.phone || 'Contato'}
                          </p>
                          <span className="bg-monte-terracota text-white text-[11px] rounded-full px-2 py-0.5 font-bold shadow-xs flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {conv.unreadCount} nova(s)
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 font-medium truncate mt-0.5">
                          {conv.lastMessage || 'Mensagem não lida'}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-monte-terracota group-hover:translate-x-1 transition-all shrink-0" />
                    </div>
                  ))
                ) : (
                  <div className="px-6 py-12 text-center text-monte-sereno space-y-2">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-monte-azul">Parabéns! Nenhuma mensagem pendente</p>
                    <p className="text-xs text-monte-sereno">Todas as mensagens de clientes foram respondidas.</p>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="h-36 bg-monte-sereno/20 rounded-3xl w-full" />

      {/* Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-32 bg-white rounded-3xl border border-monte-sereno/15 p-5 space-y-3">
            <div className="h-4 bg-monte-sereno/15 rounded-full w-20" />
            <div className="h-8 bg-monte-sereno/20 rounded-full w-14" />
            <div className="h-3 bg-monte-sereno/10 rounded-full w-24" />
          </div>
        ))}
      </div>

      {/* Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 h-72 bg-white rounded-3xl border border-monte-sereno/15" />
        <div className="lg:col-span-7 h-72 bg-white rounded-3xl border border-monte-sereno/15" />
      </div>
    </div>
  );
}
