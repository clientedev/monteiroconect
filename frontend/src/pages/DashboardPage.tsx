import { useState, useEffect, useCallback } from 'react';
import { dashboardApi } from '../lib/api';
import { useSocket } from '../context/SocketContext';
import { Smartphone, MessageSquare, Mail, TrendingUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Foto de perfil direta do WhatsApp, com fallback para inicial */
function ConvAvatar({ contactId, name, phone }: { contactId?: string; name?: string | null; phone?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!failed && contactId) {
    return (
      <img
        src={`/api/contacts/${contactId}/avatar`}
        alt=""
        onError={() => setFailed(true)}
        className="w-11 h-11 rounded-full object-cover flex-shrink-0 shadow-sm bg-monte-sereno/20"
      />
    );
  }
  return (
    <div className="w-11 h-11 bg-gradient-to-br from-monte-verde to-monte-azul rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm">
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
  messagesPerAccount: any[];
}

export default function DashboardPage() {
  const { socket } = useSocket();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const data = await dashboardApi.stats();
      setStats(data);
    } catch {}
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [loadStats]);

  // Atualizações em tempo real via Socket
  useEffect(() => {
    if (!socket) return;

    const onUpdate = () => loadStats();

    socket.on('message:new', onUpdate);
    socket.on('message:sent', onUpdate);
    socket.on('whatsapp:status', onUpdate);
    socket.on('whatsapp:connected', onUpdate);
    socket.on('whatsapp:disconnected', onUpdate);
    socket.on('conversation:read', onUpdate);
    socket.on('history:imported', onUpdate);

    return () => {
      socket.off('message:new', onUpdate);
      socket.off('message:sent', onUpdate);
      socket.off('whatsapp:status', onUpdate);
      socket.off('whatsapp:connected', onUpdate);
      socket.off('whatsapp:disconnected', onUpdate);
      socket.off('conversation:read', onUpdate);
      socket.off('history:imported', onUpdate);
    };
  }, [socket, loadStats]);


  if (loading) return <LoadingSkeleton />;

  const cards = [
    { label: 'Whatsapps conectados', value: stats?.connectedCount || 0, icon: Smartphone, gradient: 'from-monte-verde to-emerald-600' },
    { label: 'Conversas abertas', value: stats?.totalConversations || 0, icon: MessageSquare, gradient: 'from-monte-azul to-sky-600' },
    { label: 'Mensagens não lidas', value: stats?.unreadMessages || 0, icon: Mail, gradient: 'from-monte-terracota to-red-500' },
    { label: 'Mensagens hoje', value: stats?.messagesToday || 0, icon: TrendingUp, gradient: 'from-purple-600 to-indigo-600' },
    { label: 'Mensagens armazenadas', value: stats?.totalMessages || 0, icon: MessageSquare, gradient: 'from-slate-600 to-slate-800' },
  ];

  return (
    <div className="space-y-8">
      <h2 className="section-title">Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map(card => (
          <div key={card.label} className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-monte-sereno font-medium">{card.label}</p>
                <p className="text-3xl font-bold font-display text-monte-azul mt-1 tracking-tight">
                  {card.value}
                </p>
              </div>
              <div className={`w-14 h-14 bg-gradient-to-br ${card.gradient} rounded-2xl flex items-center justify-center shadow-lg`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Per account */}
      <div className="card-static overflow-hidden">
        <div className="px-6 py-4 border-b border-monte-sereno/15">
          <h3 className="font-bold font-display text-monte-azul text-lg">Whatsapps Cadastrados</h3>
        </div>
        <div className="divide-y divide-monte-sereno/10">
          {stats?.messagesPerAccount?.map((acc: any) => (
            <div key={acc.id} className="px-6 py-4 flex items-center justify-between hover:bg-monte-areiaSecao/50 transition-colors">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${acc.status === 'CONNECTED' ? 'bg-emerald-500' : acc.status === 'ERROR' ? 'bg-monte-terracota' : 'bg-monte-sereno'}`} />
                <div>
                  <p className="text-sm font-semibold text-monte-azul">{acc.name}</p>
                  <p className="text-xs text-monte-sereno capitalize">{acc.status}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-monte-azul">{acc._count.conversations}</p>
                <p className="text-xs text-monte-sereno">conversas</p>
              </div>
            </div>
          ))}
          {(!stats?.messagesPerAccount?.length) && (
            <div className="px-6 py-10 text-center text-monte-sereno text-sm">
              Nenhum WhatsApp cadastrado.{' '}
              <Link to="/whatsapp" className="text-monte-verde hover:text-monte-azul font-semibold transition-colors">
                Adicionar
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Recent conversations */}
      <div className="card-static overflow-hidden">
        <div className="px-6 py-4 border-b border-monte-sereno/15 flex items-center justify-between">
          <h3 className="font-bold font-display text-monte-azul text-lg">Conversas Recentes</h3>
          <Link to="/conversations" className="text-sm text-monte-verde hover:text-monte-azul font-semibold flex items-center gap-1 transition-colors">
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="divide-y divide-monte-sereno/10">
          {stats?.recentConversations?.slice(0, 5).map((conv: any) => (
            <div key={conv.id} className="px-6 py-3.5 flex items-center gap-3 hover:bg-monte-areiaSecao/50 transition-colors">
              <ConvAvatar contactId={conv.contact?.id} name={conv.contact?.name} phone={conv.contact?.phone} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-monte-azul">{conv.contact?.name || conv.contact?.phone}</p>
                  {conv.unreadCount > 0 && (
                    <span className="bg-monte-terracota text-white text-xs rounded-full min-w-[22px] h-[22px] flex items-center justify-center px-1.5 font-bold shadow-sm">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                <p className="text-xs text-monte-sereno truncate mt-0.5">{conv.lastMessage || 'Sem mensagens'}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8">
      <div className="h-8 bg-monte-sereno/20 rounded-full w-48 animate-pulse" />
      <div className="grid grid-cols-4 gap-5">
        {[1,2,3,4].map(i => (
          <div key={i} className="stat-card">
            <div className="h-4 bg-monte-sereno/15 rounded-full w-24 animate-pulse mb-3" />
            <div className="h-8 bg-monte-sereno/15 rounded-full w-16 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
