import { useState, useEffect, useCallback } from 'react';
import { whatsappApi } from '../lib/api';
import { getSocket } from '../lib/socket';
import { Plus, Trash2, RefreshCw, Wifi, WifiOff, Loader, QrCode, Smartphone, X, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Account {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  lastConnection: string | null;
  qrCode: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; dot: string; badge: string }> = {
  CONNECTING: { label: 'Conectando', dot: 'bg-yellow-500 animate-pulse', badge: 'badge-yellow' },
  QR_CODE: { label: 'Aguardando QR Code', dot: 'bg-blue-500', badge: 'badge-blue' },
  CONNECTED: { label: 'Conectado', dot: 'bg-green-500', badge: 'badge-green' },
  DISCONNECTED: { label: 'Desconectado', dot: 'bg-gray-400', badge: 'badge-gray' },
  RECONNECTING: { label: 'Reconectando', dot: 'bg-yellow-500 animate-pulse', badge: 'badge-yellow' },
  ERROR: { label: 'Erro', dot: 'bg-red-500', badge: 'badge-red' },
};

export default function WhatsAppPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [qrAccount, setQrAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const data = await whatsappApi.list();
      setAccounts(data);
      // Auto-open QR modal if any account is in QR_CODE state
      const qr = data.find((a: Account) => a.status === 'QR_CODE' && a.qrCode);
      if (qr) setQrAccount(qr);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handlers: Array<[string, (...a: any[]) => void]> = [
      ['whatsapp:status', (data: any) => {
        setAccounts(prev => prev.map(a => a.id === data.accountId ? { ...a, status: data.status, phone: data.phone || a.phone } : a));
      }],
      ['whatsapp:qr', (data: any) => {
        const qrCode = String(data.qrCode || '');
        setAccounts(prev => prev.map(a => a.id === data.accountId ? { ...a, status: 'QR_CODE' as const, qrCode } : a));
        setQrAccount(prev => {
          if (!prev || prev.id !== data.accountId) return prev;
          return { id: prev.id, name: prev.name, phone: prev.phone, status: prev.status, lastConnection: prev.lastConnection, createdAt: prev.createdAt, qrCode };
        });
      }],
      ['whatsapp:connected', (data: any) => {
        setQrAccount(prev => prev?.id === data.accountId ? null : prev);
      }],
    ];
    handlers.forEach(([evt, fn]) => socket!.on(evt, fn));
    return () => { handlers.forEach(([evt, fn]) => socket!.off(evt, fn)); };
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await whatsappApi.create(newName.trim());
      setNewName('');
      setShowAdd(false);
      await loadAccounts();
    } catch (err: any) { alert(err.message); }
    finally { setCreating(false); }
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('Deseja desconectar este WhatsApp?')) return;
    try { await whatsappApi.disconnect(id); loadAccounts(); } catch {}
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este WhatsApp? A sessão será encerrada.')) return;
    try { await whatsappApi.remove(id); loadAccounts(); } catch {}
  };

  const handleRefreshQR = async (id: string) => {
    try {
      const { qrCode } = await whatsappApi.refreshQR(id);
      setQrAccount(prev => prev?.id === id ? { ...prev, qrCode } : null);
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, qrCode, status: 'QR_CODE' } : a));
    } catch (err: any) { alert(err.message); }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">WhatsApps</h2>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Adicionar WhatsApp
        </button>
      </div>

      {/* Accounts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map(acc => {
          const status = statusConfig[acc.status] || statusConfig.DISCONNECTED;
          return (
            <div key={acc.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-brand-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{acc.name}</h3>
                    <p className="text-sm text-gray-500">{acc.phone || 'Sem número'}</p>
                  </div>
                </div>
                <span className={status.badge}>{status.label}</span>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                <span className="text-xs text-gray-500 capitalize">{status.label}</span>
              </div>

              {acc.lastConnection && (
                <p className="text-xs text-gray-400 mb-4">
                  Última conexão: {new Date(acc.lastConnection).toLocaleString('pt-BR')}
                </p>
              )}

              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                {acc.status === 'CONNECTED' && (
                  <Link to="/conversations" className="btn-secondary text-xs flex items-center gap-1 flex-1 justify-center">
                    <ExternalLink className="w-3 h-3" /> Conversas
                  </Link>
                )}
                {acc.status === 'QR_CODE' && (
                  <button onClick={() => setQrAccount(acc)} className="btn-secondary text-xs flex items-center gap-1 flex-1 justify-center">
                    <QrCode className="w-3 h-3" /> Ver QR Code
                  </button>
                )}
                {(acc.status === 'DISCONNECTED' || acc.status === 'ERROR') && (
                  <button onClick={() => handleRefreshQR(acc.id)} className="btn-secondary text-xs flex items-center gap-1 flex-1 justify-center">
                    <RefreshCw className="w-3 h-3" /> Reconectar
                  </button>
                )}
                {(acc.status === 'CONNECTING' || acc.status === 'RECONNECTING') && (
                  <button disabled className="btn-secondary text-xs flex items-center gap-1 flex-1 justify-center opacity-50">
                    <Loader className="w-3 h-3 animate-spin" /> {acc.status === 'RECONNECTING' ? 'Reconectando...' : 'Conectando...'}
                  </button>
                )}
                {acc.status === 'CONNECTED' && (
                  <button onClick={() => handleDisconnect(acc.id)} className="btn-secondary text-xs flex items-center gap-1" title="Desconectar">
                    <WifiOff className="w-3 h-3" />
                  </button>
                )}
                <button onClick={() => handleRemove(acc.id)} className="btn-secondary text-xs text-red-600 hover:bg-red-50 flex items-center gap-1" title="Remover">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}

        {accounts.length === 0 && (
          <div className="col-span-full card p-12 text-center">
            <Smartphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-3">Nenhum WhatsApp conectado</p>
            <button onClick={() => setShowAdd(true)} className="btn-primary">
              <Plus className="w-4 h-4 inline mr-2" />Adicionar WhatsApp
            </button>
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Adicionar WhatsApp</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da conta</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Ex: WhatsApp Comercial"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
              <button onClick={handleCreate} disabled={creating || !newName.trim()} className="btn-primary w-full">
                {creating ? 'Criando...' : 'Criar Sessão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code modal */}
      {qrAccount && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setQrAccount(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 text-center" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">QR Code - {qrAccount.name}</h3>
            {qrAccount.qrCode ? (
              <div className="flex justify-center mb-4">
                <img src={qrAccount.qrCode} alt="QR Code" className="w-64 h-64 rounded-lg border border-gray-200" />
              </div>
            ) : (
              <div className="w-64 h-64 mx-auto mb-4 bg-gray-100 rounded-lg flex items-center justify-center">
                <Loader className="w-8 h-8 text-gray-400 animate-spin" />
              </div>
            )}
            <p className="text-sm text-gray-600 mb-2">Abra o WhatsApp no celular e escaneie este código</p>
            <p className="text-xs text-gray-400 mb-4">WhatsApp → Dispositivos conectados → Conectar</p>
            <div className="flex gap-2">
              <button onClick={() => setQrAccount(null)} className="btn-secondary flex-1">Fechar</button>
              <button onClick={() => handleRefreshQR(qrAccount.id)} className="btn-secondary flex-1 flex items-center justify-center gap-1">
                <RefreshCw className="w-3 h-3" /> Atualizar QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
