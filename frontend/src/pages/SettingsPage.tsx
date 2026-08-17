import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Settings as SettingsIcon, Shield, Key, Bell, Database, Info } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('info');

  return (
    <div className="space-y-8">
      <h2 className="section-title">Configurações</h2>

      <div className="flex gap-1 bg-white/50 backdrop-blur-sm border border-monte-sereno/15 rounded-full p-1 w-fit">
        {[
          { key: 'info', label: 'Informações', icon: Info },
          { key: 'security', label: 'Segurança', icon: Shield },
          { key: 'notifications', label: 'Notificações', icon: Bell },
          { key: 'database', label: 'Banco de Dados', icon: Database },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-full transition-all duration-200 ${
              tab === t.key
                ? 'bg-monte-verde text-white shadow-sm'
                : 'text-monte-sereno hover:text-monte-azul hover:bg-white/60'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="card-static p-8 space-y-6">
          <h3 className="text-lg font-bold font-display text-monte-azul">Informações do Sistema</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'Sistema', value: 'Monteiro Conecta v1.0.0' },
              { label: 'Biblioteca WhatsApp', value: '@whiskeysockets/baileys' },
              { label: 'Backend', value: 'Node.js + Express + TypeScript' },
              { label: 'Frontend', value: 'React + Vite + Tailwind CSS' },
              { label: 'Tempo Real', value: 'Socket.IO / WebSocket' },
              { label: 'Banco de Dados', value: 'Prisma (SQLite / PostgreSQL)' },
            ].map(item => (
              <div key={item.label} className="bg-monte-areiaSecao/60 rounded-2xl p-4">
                <p className="text-xs font-medium text-monte-sereno uppercase tracking-wider mb-1">{item.label}</p>
                <p className="font-medium text-monte-azul text-sm">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-amber-50/80 backdrop-blur-sm border border-amber-200/50 rounded-2xl p-4">
            <p className="text-sm font-semibold text-amber-800">⚠️ Aviso</p>
            <p className="text-sm text-amber-700 mt-1">
              Este sistema utiliza integração não oficial com WhatsApp Web. O uso pode violar os termos de serviço do WhatsApp.
              Use por sua conta e risco. Não armazene credenciais em locais inseguros.
            </p>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="card-static p-8 space-y-6">
          <h3 className="text-lg font-bold font-display text-monte-azul">Segurança</h3>
          <div className="space-y-3">
            {[
              { name: 'Autenticação JWT', desc: 'Tokens assinados com HMAC-SHA256' },
              { name: 'Rate Limiting', desc: 'Proteção contra abuso de API' },
              { name: 'Helmet (Headers de Segurança)', desc: 'Proteção XSS, CSRF, etc.' },
              { name: 'CORS', desc: 'Origens restritas configuradas' },
              { name: 'Sessões do WhatsApp', desc: 'Armazenadas apenas no servidor, nunca expostas ao frontend' },
            ].map((item, i, arr) => (
              <div key={item.name} className={`flex items-center justify-between py-4 ${i < arr.length - 1 ? 'border-b border-monte-sereno/15' : ''}`}>
                <div>
                  <p className="text-sm font-semibold text-monte-azul">{item.name}</p>
                  <p className="text-xs text-monte-sereno">{item.desc}</p>
                </div>
                <span className="badge-verde">Ativo</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="card-static p-8 space-y-4">
          <h3 className="text-lg font-bold font-display text-monte-azul">Notificações</h3>
          <p className="text-sm text-monte-sereno leading-relaxed">
            Notificações são recebidas em tempo real via WebSocket. Novas mensagens atualizam
            automaticamente o dashboard, contadores e conversas sem necessidade de refresh.
            O badge na sidebar mostra o total de mensagens não lidas de todas as contas.
          </p>
        </div>
      )}

      {tab === 'database' && (
        <div className="card-static p-8 space-y-4">
          <h3 className="text-lg font-bold font-display text-monte-azul">Banco de Dados</h3>
          <p className="text-sm text-monte-sereno leading-relaxed">
            O sistema utiliza Prisma ORM com SQLite para desenvolvimento e PostgreSQL para produção.
            As tabelas incluem: users, whatsapp_accounts, contacts, conversations, messages, tags, logs, notifications.
          </p>
        </div>
      )}
    </div>
  );
}
