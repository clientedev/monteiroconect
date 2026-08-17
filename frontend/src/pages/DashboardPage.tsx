import { useState, useEffect } from 'react';
import { dashboardApi } from '../lib/api';
import { Smartphone, MessageSquare, Mail, TrendingUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Stats {
  connectedCount: number;
  disconnectedCount: number;
  totalConversations: number;
  unreadMessages: number;
  messagesToday: number;
  recentMessages: any[];
  recentConversations: any[];
  messagesPerAccount: any[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const data = await dashboardApi.stats();
      setStats(data);
    } catch {}
    finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  const cards = [
    { label: 'WhatsApps conectados', value: stats?.connectedCount || 0, icon: Smartphone, color: 'bg-green-500', textColor: 'text-green-600' },
    { label: 'Conversas abertas', value: stats?.totalConversations || 0, icon: MessageSquare, color: 'bg-blue-500', textColor: 'text-blue-600' },
    { label: 'Mensagens não lidas', value: stats?.unreadMessages || 0, icon: Mail, color: 'bg-amber-500', textColor: 'text-amber-600' },
    { label: 'Mensagens hoje', value: stats?.messagesToday || 0, icon: TrendingUp, color: 'bg-purple-500', textColor: 'text-purple-600' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`w-12 h-12 ${card.color} rounded-xl flex items-center justify-center`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Per account */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">WhatsApps Cadastrados</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {stats?.messagesPerAccount?.map((acc: any) => (
            <div key={acc.id} className="px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${acc.status === 'CONNECTED' ? 'bg-green-500' : acc.status === 'ERROR' ? 'bg-red-500' : 'bg-gray-400'}`} />
                <div>
                  <p className="text-sm font-medium text-gray-900">{acc.name}</p>
                  <p className="text-xs text-gray-500 capitalize">{acc.status}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{acc._count.conversations}</p>
                <p className="text-xs text-gray-500">conversas</p>
              </div>
            </div>
          ))}
          {(!stats?.messagesPerAccount?.length) && (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              Nenhum WhatsApp cadastrado. <Link to="/whatsapp" className="text-brand-600 hover:underline">Adicionar</Link>
            </div>
          )}
        </div>
      </div>

      {/* Recent conversations */}
      <div className="card">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Conversas Recentes</h3>
          <Link to="/conversations" className="text-sm text-brand-600 hover:underline flex items-center gap-1">
            Ver todas <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="divide-y divide-gray-100">
          {stats?.recentConversations?.slice(0, 5).map((conv: any) => (
            <div key={conv.id} className="px-5 py-3 flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
                {(conv.contact?.name || conv.contact?.phone || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">{conv.contact?.name || conv.contact?.phone}</p>
                  {conv.unreadCount > 0 && (
                    <span className="bg-brand-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{conv.unreadCount}</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">{conv.lastMessage || 'Sem mensagens'}</p>
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
    <div className="space-y-6">
      <div className="h-8 bg-gray-200 rounded w-48 animate-pulse" />
      <div className="grid grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="card p-5">
            <div className="h-4 bg-gray-200 rounded w-24 animate-pulse mb-3" />
            <div className="h-8 bg-gray-200 rounded w-16 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
