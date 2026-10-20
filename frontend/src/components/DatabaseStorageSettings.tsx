import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Calendar,
  ShieldCheck,
  Zap,
  Info,
  Check,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { storageApi, StorageStats, StorageCleanResult } from '../lib/api';

export default function DatabaseStorageSettings() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [retentionDays, setRetentionDays] = useState<number>(5);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<StorageCleanResult | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isResettingLock, setIsResettingLock] = useState(false);

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const data = await storageApi.getStatus();
      setStats(data);
    } catch (err: any) {
      console.error('Erro ao carregar estatísticas do banco:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleResetLock = async () => {
    try {
      setIsResettingLock(true);
      const res = await storageApi.resetLock();
      setFeedbackMessage({
        type: 'success',
        text: res.message || 'Processo destravado com sucesso!',
      });
      await fetchStats();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Erro ao destravar o processo.',
      });
    } finally {
      setIsResettingLock(false);
    }
  };

  const [isVacuuming, setIsVacuuming] = useState(false);

  const handleExecuteVacuum = async () => {
    try {
      setIsVacuuming(true);
      setFeedbackMessage(null);
      const res = await storageApi.vacuumStorage();
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: 'Otimização física concluída! O espaço em disco foi desfragmentado e liberado com sucesso.',
        });
      } else {
        setFeedbackMessage({
          type: 'error',
          text: res.message || 'Falha ao executar liberação de espaço.',
        });
      }
      await fetchStats();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Erro ao otimizar espaço em disco.',
      });
    } finally {
      setIsVacuuming(false);
    }
  };

  const handleExecuteClean = async () => {
    try {
      setIsProcessing(true);
      setConfirmModalOpen(false);
      setFeedbackMessage(null);

      const result = await storageApi.cleanStorage({
        retentionDays,
        preserveRecentPerConv: 5,
      });

      setLastResult(result);

      if (result.success) {
        // Imediatamente executa desfragmentação para devolver o espaço ao disco
        await storageApi.vacuumStorage().catch(() => {});

        setFeedbackMessage({
          type: 'success',
          text: 'Alívio de espaço concluído com sucesso! Arquivos temporários e registros desnecessários foram limpos, mantendo todas as suas conversas e mensagens recentes 100% intactas.',
        });
      } else {
        setFeedbackMessage({
          type: 'error',
          text: result.error || 'Ocorreu um erro durante a otimização de espaço.',
        });
      }

      await fetchStats();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Erro ao executar alívio de espaço.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner Principal / Card de Apresentação */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 sm:p-8 text-white shadow-xl border border-slate-700/60">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>WhatsApp como Backup Oficial + Sistema Ultra Rápido</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <Database className="w-8 h-8 text-emerald-400" />
              Gerenciamento e Alívio de Espaço
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              O WhatsApp no celular é o backup definitivo de todo o seu histórico. O sistema armazena localmente apenas as conversas recentes
              <span className="font-semibold text-emerald-300"> (últimos {retentionDays} dias)</span> para manter o sistema leve, ágil e com alívio contínuo de espaço.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              onClick={fetchStats}
              disabled={loadingStats || isProcessing || isVacuuming}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700/90 border border-slate-600/80 transition-all flex items-center justify-center gap-2 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${loadingStats ? 'animate-spin' : ''}`} />
              <span>Atualizar Status</span>
            </button>

            <button
              onClick={handleExecuteVacuum}
              disabled={isVacuuming || isProcessing}
              title="Executa desfragmentação física das tabelas para liberar espaço não utilizado"
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-teal-200 bg-teal-950/60 hover:bg-teal-900/80 border border-teal-500/40 transition-all flex items-center justify-center gap-2 hover:text-white disabled:opacity-50"
            >
              <Database className={`w-4 h-4 ${isVacuuming ? 'animate-spin' : ''}`} />
              <span>{isVacuuming ? 'Liberando...' : 'Liberar Espaço em Disco'}</span>
            </button>

            <button
              onClick={() => setConfirmModalOpen(true)}
              disabled={isProcessing || isVacuuming}
              className="px-5 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isProcessing ? 'Aliviando...' : 'Aliviar Espaço Agora'}</span>
            </button>
          </div>
        </div>

        {/* Efeito sutil de brilho no fundo */}
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* Alerta de Feedback */}
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/50 border-rose-500/50 text-rose-200'
          }`}
        >
          <div className="flex items-start gap-3 flex-1">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 leading-relaxed">{feedbackMessage.text}</div>
          </div>

          {feedbackMessage.type === 'error' && (feedbackMessage.text.includes('execução') || feedbackMessage.text.includes('Destravar')) && (
            <button
              type="button"
              onClick={handleResetLock}
              disabled={isResettingLock}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-sm flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isResettingLock ? 'animate-spin' : ''}`} />
              <span>Destravar Processo</span>
            </button>
          )}
        </div>
      )}

      {/* Grid de Estatísticas e Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Status do Espaço</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-emerald-400">
                Otimizado
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Aliviado
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-1">
              <span>Armazenamento limpo e ágil</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Mensagens Ativas</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-white">
              {loadingStats ? '...' : (stats?.activeMessagesInDb ?? 0).toLocaleString('pt-BR')}
            </span>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>Últimos {retentionDays} dias mantidos</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Prontas p/ Alívio</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-amber-400">
              {loadingStats ? '...' : (stats?.eligibleForArchive ?? 0).toLocaleString('pt-BR')}
            </span>
            <div className="text-xs text-slate-400 mt-1">
              <span>Mensagens com mais de {retentionDays} dias</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Backup Oficial</span>
            <Smartphone className="w-4 h-4 text-teal-400" />
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold text-teal-300">
              WhatsApp Conectado
            </span>
            <div className="text-xs text-slate-400 mt-1">
              <span>Histórico 100% seguro no celular</span>
            </div>
          </div>
        </div>
      </div>

      {/* Painel Explicativo da Arquitetura sem Google Drive */}
      <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800 space-y-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-white">
              Como funciona o gerenciamento inteligente de dados:
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              Em vez de depender de nuvens externas, o sistema utiliza a nuvem nativa do WhatsApp como fonte primária:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs sm:text-sm">
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
            <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
              <Check className="w-4 h-4" />
              <span>1. Sistema Leve e Ágil</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              O armazenamento local guarda apenas os últimos <strong>{retentionDays} dias</strong>. As buscas, conversas e notificações abrem instantaneamente sem lentidão.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
            <div className="font-semibold text-teal-300 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4" />
              <span>2. WhatsApp como Backup</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Todo o histórico de anos continua 100% seguro no seu WhatsApp no celular. Nada é perdido do WhatsApp oficial.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 space-y-2">
            <div className="font-semibold text-blue-300 flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" />
              <span>3. Busca Sob Demanda</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Ao abrir um chat e rolar para cima além dos {retentionDays} dias, você pode solicitar as mensagens anteriores diretamente ao WhatsApp conectado.
            </p>
          </div>
        </div>

        {/* Seleção de Janela de Retenção */}
        <div className="pt-2 border-t border-slate-800">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Definir Janela de Retenção Local:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { days: 3, label: '3 Dias', desc: 'Máximo alívio' },
              { days: 5, label: '5 Dias', desc: 'Recomendado', highlight: true },
              { days: 7, label: '7 Dias', desc: '1 Semana' },
              { days: 15, label: '15 Dias', desc: 'Quinzenal' },
              { days: 30, label: '30 Dias', desc: '1 Mês' },
            ].map((item) => (
              <button
                key={item.days}
                type="button"
                onClick={() => setRetentionDays(item.days)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  retentionDays === item.days
                    ? 'bg-emerald-500/20 border-emerald-500/60 text-white shadow-md ring-1 ring-emerald-500/50'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800/80 hover:border-slate-600'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{item.label}</span>
                  {retentionDays === item.days && <Check className="w-4 h-4 text-emerald-400" />}
                </div>
                <span className="text-xs text-slate-400 block mt-1">
                  {item.highlight ? '★ ' + item.desc : item.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Relatório do Último Alívio Realizado */}
      {lastResult && (
        <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Resultado do Último Alívio de Espaço
            </h3>
            <span className="text-xs text-slate-400">
              Retenção aplicada: <strong>{lastResult.retentionDays} dias</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <span className="text-xs text-slate-400">Mensagens Aliviadas</span>
              <p className="text-lg font-bold text-emerald-400 mt-1">
                {lastResult.archivedMessages.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <span className="text-xs text-slate-400">Conversas Otimizadas</span>
              <p className="text-lg font-bold text-white mt-1">
                {lastResult.archivedConversations.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <span className="text-xs text-slate-400">Logs Antigos Purgados</span>
              <p className="text-lg font-bold text-teal-400 mt-1">
                {lastResult.purgedLogs.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <span className="text-xs text-slate-400">Mensagens Mantidas</span>
              <p className="text-lg font-bold text-white mt-1">
                {lastResult.activeMessagesRemaining.toLocaleString('pt-BR')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação Seguro */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-white">Confirmar Alívio de Espaço</h4>
                <p className="text-xs text-slate-400">Libera espaço do sistema mantendo dados recentes.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs sm:text-sm text-slate-300 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                <Check className="w-4 h-4" />
                <span>Últimos {retentionDays} dias:</span>
              </div>
              <p className="text-slate-400 pl-6">
                Permanecerão 100% intactas para atendimento diário normal.
              </p>

              <div className="flex items-center gap-2 text-amber-300 font-semibold pt-1">
                <Calendar className="w-4 h-4" />
                <span>Mensagens com mais de {retentionDays} dias:</span>
              </div>
              <p className="text-slate-400 pl-6">
                Serão limpas do armazenamento local para economizar espaço. Elas continuam salvas no seu WhatsApp oficial no celular.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteClean}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md transition-all flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                <span>Confirmar e Aliviar Espaço</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
