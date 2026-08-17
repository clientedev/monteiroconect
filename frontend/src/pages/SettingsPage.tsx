import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Settings as SettingsIcon, Shield, Key, Bell, Database, Info } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('info');

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Configurações</h2>

      <div className="flex gap-2 border-b border-gray-200 pb-0">
        {[
          { key: 'info', label: 'Informações', icon: Info },
          { key: 'security', label: 'Segurança', icon: Shield },
          { key: 'notifications', label: 'Notificações', icon: Bell },
          { key: 'database', label: 'Banco de Dados', icon: Database },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="card p-6 space-y-4">
          <h3 className="text-lg font-semibold">Informações do Sistema</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Sistema</p>
              <p className="font-medium">Monteiro Conecta v1.0.0</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Biblioteca WhatsApp</p>
              <p className="font-medium">@whiskeysockets/baileys</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Backend</p>
              <p className="font-medium">Node.js + Express + TypeScript</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Frontend</p>
              <p className="font-medium">React + Vite + Tailwind CSS</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Tempo Real</p>
              <p className="font-medium">Socket.IO / WebSocket</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Banco de Dados</p>
              <p className="font-medium">Prisma (SQLite / PostgreSQL)</p>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
            <p className="text-sm font-medium text-amber-800">⚠️ Aviso</p>
            <p className="text-sm text-amber-700 mt-1">
              Este sistema utiliza integração não oficial com WhatsApp Web. O uso pode violar os termos de serviço do WhatsApp.
              Use por sua conta e risco. Não armazene credenciais em locais inseguros.
            </p>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="card p-6 space-y-4">
          <h3 className="text-lg font-semibold">Segurança</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium">Autenticação JWT</p>
                <p className="text-xs text-gray-500">Tokens assinados com HMAC-SHA256</p>
              </div>
              <span className="badge-green">Ativo</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium">Rate Limiting</p>
                <p className="text-xs text-gray-500">Proteção contra abuso de API</p>
              </div>
              <span className="badge-green">Ativo</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium">Helmet (Headers de Segurança)</p>
                <p className="text-xs text-gray-500">Proteção XSS, CSRF, etc.</p>
              </div>
              <span className="badge-green">Ativo</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-medium">CORS</p>
                <p className="text-xs text-gray-500">Origens restritas configuradas</p>
              </div>
              <span className="badge-green">Ativo</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">Sessões do WhatsApp</p>
                <p className="text-xs text-gray-500">Armazenadas apenas no servidor, nunca expostas ao frontend</p>
              </div>
              <span className="badge-green">Seguro</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="card p-6 space-y-4">
          <h3 className="text-lg font-semibold">Notificações</h3>
          <p className="text-sm text-gray-500">
            Notificações são recebidas em tempo real via WebSocket. Novas mensagens atualizam
            automaticamente o dashboard, contadores e conversas sem necessidade de refresh.
          </p>
        </div>
      )}

      {tab === 'database' && (
        <div className="card p-6 space-y-4">
          <h3 className="text-lg font-semibold">Banco de Dados</h3>
          <p className="text-sm text-gray-500">
            O sistema utiliza Prisma ORM com SQLite para desenvolvimento e PostgreSQL para produção.
            As tabelas incluem: users, whatsapp_accounts, contacts, conversations, messages, tags, logs, notifications.
          </p>
        </div>
      )}
    </div>
  );
}
