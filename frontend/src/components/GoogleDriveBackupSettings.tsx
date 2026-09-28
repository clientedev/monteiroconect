import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CloudUpload,
  HardDrive,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Calendar,
  ShieldCheck,
  FileArchive,
  ArrowRight,
  ExternalLink,
  Info,
  Check,
  Zap,
} from 'lucide-react';
import { archiveApi, ArchiveStats, ArchiveRelieveResult } from '../lib/api';

export default function GoogleDriveBackupSettings() {
  const [stats, setStats] = useState<ArchiveStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [retentionDays, setRetentionDays] = useState<number>(5);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<ArchiveRelieveResult | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    folderName?: string;
    email?: string;
    error?: string;
  } | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      const data = await archiveApi.getStatus();
      setStats(data);
      if (data.driveStatus) {
        setTestResult(data.driveStatus);
      }
    } catch (err: any) {
      console.error('Erro ao carregar status do arquivo:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleTestDrive = async () => {
    try {
      setIsTestingDrive(true);
      setFeedbackMessage(null);
      const res = await archiveApi.testDrive();
      setTestResult(res);
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: `Conexão validada! Pasta: "${res.folderName || 'Backup'}" acessível com permissão de gravação.`,
        });
      } else {
        setFeedbackMessage({
          type: 'error',
          text: res.error || 'Falha ao testar conexão com o Google Drive.',
        });
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Erro inesperado ao testar o Google Drive.',
      });
    } finally {
      setIsTestingDrive(false);
    }
  };

  const [isResettingLock, setIsResettingLock] = useState(false);

  const handleResetLock = async () => {
    try {
      setIsResettingLock(true);
      const res = await archiveApi.resetLock();
      setFeedbackMessage({
        type: 'success',
        text: res.message || 'Processo destravado com sucesso! Agora você já pode iniciar o backup.',
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

  const handleExecuteBackup = async () => {
    try {
      setIsProcessing(true);
      setConfirmModalOpen(false);
      setFeedbackMessage(null);

      const result = await archiveApi.backupAndRelieve({
        retentionDays,
        preserveRecentPerConv: 1,
      });

      setLastResult(result);

      if (result.success) {
        if (result.error) {
          // Concluiu a parte do banco mas com aviso no Drive
          setFeedbackMessage({
            type: 'error',
            text: result.error,
          });
        } else {
          setFeedbackMessage({
            type: 'success',
            text: `Backup concluído com sucesso! ${result.archivedMessages.toLocaleString('pt-BR')} mensagens enviadas para o Google Drive e liberadas do Postgres. Dados dos últimos ${retentionDays} dias mantidos no banco.`,
          });
        }
      } else {
        setFeedbackMessage({
          type: 'error',
          text: result.error || 'Ocorreu um erro durante a rotina de alívio do banco.',
        });
      }

      await fetchStats();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Erro ao executar o backup e alívio do banco de dados.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSyncPending = async () => {
    try {
      setIsSyncing(true);
      setFeedbackMessage(null);
      const res = await archiveApi.syncPending();
      if (res.success) {
        setFeedbackMessage({
          type: 'success',
          text: `${res.syncedCount} arquivos sincronizados com o Google Drive.`,
        });
      }
      await fetchStats();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.message || 'Erro ao sincronizar pendências com o Google Drive.',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const isDriveOk = testResult?.success || (stats?.driveConfigured && !testResult?.error);

  return (
    <div className="space-y-6">
      {/* Banner Principal / Card de Apresentação */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 sm:p-8 text-white shadow-xl border border-slate-700/60">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Proteção e Economia de Armazenamento no Postgres</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <Cloud className="w-8 h-8 text-emerald-400" />
              Backup Google Drive & Limpeza do Postgres
            </h2>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Mantenha o PostgreSQL leve e rápido arquivando com segurança mensagens e dados pouco acessados diretamente no Google Drive.
              <span className="font-semibold text-emerald-300"> Dados dos últimos {retentionDays} dias são mantidos intactos no banco de dados</span>, garantindo agilidade no atendimento diário.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              onClick={handleTestDrive}
              disabled={isTestingDrive || isProcessing}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-700/90 border border-slate-600/80 transition-all flex items-center justify-center gap-2 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${isTestingDrive ? 'animate-spin' : ''}`} />
              <span>{isTestingDrive ? 'Testando...' : 'Testar Conexão Drive'}</span>
            </button>

            <button
              onClick={() => setConfirmModalOpen(true)}
              disabled={isProcessing}
              className="px-5 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
            >
              <CloudUpload className={`w-4 h-4 ${isProcessing ? 'animate-bounce' : ''}`} />
              <span>{isProcessing ? 'Executando Backup...' : 'Fazer Backup no Drive Agora'}</span>
            </button>
          </div>
        </div>

        {/* Efeito sutil de brilho no fundo */}
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* Alerta de Feedback com Ação de Destravar */}
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

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            {feedbackMessage.type === 'error' && (feedbackMessage.text.includes('execução') || feedbackMessage.text.includes('Destravar')) && (
              <button
                type="button"
                onClick={handleResetLock}
                disabled={isResettingLock}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-sm flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResettingLock ? 'animate-spin' : ''}`} />
                <span>{isResettingLock ? 'Destravando...' : 'Destravar Processo'}</span>
              </button>
            )}
            <button
              onClick={() => setFeedbackMessage(null)}
              className="text-slate-400 hover:text-white text-xs underline px-2 py-1"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Status da Conexão com Google Drive */}
      <div className="bg-slate-900/60 rounded-2xl p-5 sm:p-6 border border-slate-800">
        <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-emerald-400" />
          Status do Destino (Google Drive)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Status do Serviço</span>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`w-3 h-3 rounded-full ${
                  isDriveOk ? 'bg-emerald-500 shadow-md shadow-emerald-500/50 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="font-semibold text-white text-sm">
                {isDriveOk
                  ? 'Conectado e Operacional'
                  : stats?.driveConfigured
                  ? 'Configurado com Alerta'
                  : 'Cache Local (Drive Pendente)'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {isDriveOk
                ? 'Backups serão enviados diretamente para o Google Drive em formato .json.gz.'
                : 'Backups são compactados e armazenados com segurança no servidor até o Drive ser vinculado.'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Pasta no Google Drive</span>
            <div className="mt-2">
              <span className="font-semibold text-white text-sm truncate block">
                {testResult?.folderName || 'Pasta Configurada'}
              </span>
              <span className="text-xs text-slate-400">Permissão de Gravação: {isDriveOk ? 'Editor (OK)' : 'Verificar'}</span>
            </div>
            <div className="text-xs text-emerald-400/90 flex items-center gap-1 mt-2">
              <Check className="w-3.5 h-3.5" />
              <span>Compactação GZIP Nível 9</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Conta de Serviço</span>
            <div className="mt-2">
              <span className="font-mono text-xs text-slate-300 truncate block">
                {stats?.driveAccountEmail || testResult?.email || 'Definida via variável de ambiente'}
              </span>
              <span className="text-xs text-slate-400 block mt-0.5">Google Cloud Service Account</span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/50">
              <span className="text-xs text-slate-400">Arquivos Pendentes:</span>
              <span className="text-xs font-semibold text-amber-300">
                {stats?.unsyncedArchives || 0}
              </span>
            </div>
          </div>
        </div>

        {stats?.unsyncedArchives && stats.unsyncedArchives > 0 ? (
          <div className="mt-4 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-center justify-between">
            <span className="text-xs text-amber-200">
              Existem <strong>{stats.unsyncedArchives}</strong> arquivos locais aguardando envio para o Google Drive.
            </span>
            <button
              onClick={handleSyncPending}
              disabled={isSyncing}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
            >
              {isSyncing ? 'Sincronizando...' : 'Sincronizar com Drive'}
            </button>
          </div>
        ) : null}
      </div>

      {/* Grid de Estatísticas e Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Mensagens Ativas (DB)</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-white">
              {loadingStats ? '...' : (stats?.activeMessagesInDb ?? 0).toLocaleString('pt-BR')}
            </span>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              <span>{stats?.recentMessagesRetained?.toLocaleString('pt-BR') || 0} recentes (últimos 5 dias)</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Elegíveis p/ Backup</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-amber-400">
              {loadingStats ? '...' : (stats?.eligibleForArchive ?? 0).toLocaleString('pt-BR')}
            </span>
            <div className="text-xs text-slate-400 mt-1">
              <span>Mensagens com mais de 5 dias</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Arquivadas no Drive</span>
            <Cloud className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-white">
              {loadingStats ? '...' : (stats?.totalArchivedMessages ?? 0).toLocaleString('pt-BR')}
            </span>
            <div className="text-xs text-slate-400 mt-1">
              <span>Em {stats?.totalArchives || 0} arquivos compactados</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/60 rounded-2xl p-5 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium uppercase tracking-wider">Espaço Otimizado</span>
            <FileArchive className="w-4 h-4 text-teal-400" />
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-teal-400">
              {loadingStats ? '...' : formatBytes(stats?.totalCompressedBytes || 0)}
            </span>
            <div className="text-xs text-slate-400 mt-1">
              <span>Compactado (.json.gz ~90%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Configuração de Retenção & Execução do Backup */}
      <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800 space-y-6">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            Janela de Retenção no PostgreSQL
          </h3>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Escolha o período de dados que permanecerá no banco local. Todo o histórico anterior será compactado, enviado ao Google Drive e removido do Postgres.
          </p>
        </div>

        {/* Seleção de dias de retenção */}
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
                  ? 'bg-emerald-500/20 border-emerald-500/60 text-white shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/50'
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

        {/* Painel Explicativo com a Regra dos 5 dias */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              <strong className="text-white">Como funciona esta operação com {retentionDays} dias:</strong>
              <ul className="list-disc list-inside mt-1 space-y-1 text-slate-400">
                <li><span className="text-emerald-300 font-medium">Permanecem no Postgres:</span> Todas as mensagens recebidas ou enviadas nos últimos <strong>{retentionDays} dias</strong>.</li>
                <li><span className="text-blue-300 font-medium">Vão para o Google Drive:</span> Histórico com mais de <strong>{retentionDays} dias</strong> e conversas pouco acessadas, compactadas em gzip de alta compressão.</li>
                <li><span className="text-teal-300 font-medium">Limpeza de manutenção:</span> Logs antigos do sistema (&gt; {retentionDays} dias) e notificações lidas são purgados para liberar espaço no disco do Railway.</li>
              </ul>
            </div>
          </div>

          <button
            onClick={() => setConfirmModalOpen(true)}
            disabled={isProcessing}
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
          >
            <CloudUpload className="w-4 h-4" />
            <span>Executar Backup & Limpeza</span>
          </button>
        </div>
      </div>

      {/* Relatório do Último Alívio Realizado */}
      {lastResult && (
        <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Resultado da Última Operação
            </h3>
            <span className="text-xs text-slate-400">
              Retenção aplicada: <strong>{lastResult.retentionDays} dias</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <span className="text-xs text-slate-400">Mensagens no Drive</span>
              <p className="text-lg font-bold text-emerald-400 mt-1">
                {lastResult.archivedMessages.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <span className="text-xs text-slate-400">Conversas Processadas</span>
              <p className="text-lg font-bold text-white mt-1">
                {lastResult.archivedConversations.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <span className="text-xs text-slate-400">Logs Purgados</span>
              <p className="text-lg font-bold text-teal-400 mt-1">
                {lastResult.purgedLogs.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
              <span className="text-xs text-slate-400">Google Drive</span>
              <p className="text-sm font-semibold text-emerald-300 mt-1 flex items-center gap-1">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Sincronizado</span>
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
                <CloudUpload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-white">Confirmar Backup & Limpeza</h4>
                <p className="text-xs text-slate-400">Essa ação otimizará o PostgreSQL mantendo dados recentes.</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs sm:text-sm text-slate-300 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                <Check className="w-4 h-4" />
                <span>Dados dos últimos {retentionDays} dias:</span>
              </div>
              <p className="text-slate-400 pl-6">
                Ficarão 100% disponíveis no Postgres para atendimento normal.
              </p>

              <div className="flex items-center gap-2 text-blue-300 font-semibold pt-1">
                <Cloud className="w-4 h-4" />
                <span>Dados com mais de {retentionDays} dias:</span>
              </div>
              <p className="text-slate-400 pl-6">
                Serão compactados (.json.gz) e enviados para a pasta configurada do Google Drive, liberando o banco de dados.
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
                onClick={handleExecuteBackup}
                disabled={isProcessing}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-md shadow-emerald-950/40 transition-all flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                <span>Confirmar e Iniciar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
