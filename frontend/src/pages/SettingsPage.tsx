import React, { useState } from 'react';
import { Bell, Database, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import MobileNotificationSettings from '../components/MobileNotificationSettings';
import GoogleDriveBackupSettings from '../components/GoogleDriveBackupSettings';

type SettingsTab = 'notifications' | 'backup';

export default function SettingsPage() {
  // Notificações abre SEMPRE como primeira aba padrão ao entrar
  const [activeTab, setActiveTab] = useState<SettingsTab>('notifications');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-monte-verde" />
            Configurações de Notificações
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Personalize toques, alertas sonoros e notificações push para dispositivos móveis e desktop.
          </p>
        </div>

        {/* Abas discretas - Backup fica reservado e mais discreto */}
        {isAdmin && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'notifications'
                  ? 'bg-monte-verde text-slate-900 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Notificações</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('backup')}
              title="Área restrita a administradores"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'backup'
                  ? 'bg-slate-700/80 text-white font-semibold shadow-sm border border-slate-600/50'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-slate-400" />
              <span>Backup Drive</span>
              <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">Admin</span>
            </button>
          </div>
        )}
      </div>

      {/* Conteúdo: Notificações abre primeiro */}
      {activeTab === 'notifications' ? (
        <MobileNotificationSettings />
      ) : (
        isAdmin && <GoogleDriveBackupSettings />
      )}
    </div>
  );
}
