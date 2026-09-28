import React, { useState } from 'react';
import { Cloud, Bell } from 'lucide-react';
import MobileNotificationSettings from '../components/MobileNotificationSettings';
import GoogleDriveBackupSettings from '../components/GoogleDriveBackupSettings';

type SettingsTab = 'backup' | 'notifications';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('backup');

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            Configurações do Sistema
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Gerencie backups no Google Drive, alívio e otimização do PostgreSQL e preferências de notificações.
          </p>
        </div>

        {/* Tabs switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'backup'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>Backup Google Drive</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'notifications'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-950/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span>Notificações & Sons</span>
          </button>
        </div>
      </div>

      {/* Conteúdo da Aba Ativa */}
      {activeTab === 'backup' ? (
        <GoogleDriveBackupSettings />
      ) : (
        <div className="space-y-6">
          <h2 className="section-title">Configuração de Notificações</h2>
          <MobileNotificationSettings />
        </div>
      )}
    </div>
  );
}
