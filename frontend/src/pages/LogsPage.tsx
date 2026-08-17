import { useState, useEffect } from 'react';
import { logApi } from '../lib/api';
import { ScrollText, Trash2, RefreshCw } from 'lucide-react';

const levelColors: Record<string, string> = {
  info: 'badge-green',
  warning: 'badge-yellow',
  error: 'badge-red',
};

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await logApi.list(level, page);
      setLogs(data.logs || []);
      setTotal(data.total);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, level]);

  const handleClear = async () => {
    if (!confirm('Limpar todos os logs?')) return;
    try { await logApi.clear(); load(); } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Logs do Sistema</h2>
        <div className="flex gap-2">
          <select className="input w-auto" value={level} onChange={e => { setLevel(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="info">INFO</option>
            <option value="warning">WARNING</option>
            <option value="error">ERROR</option>
          </select>
          <button onClick={load} className="btn-secondary flex items-center gap-1"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={handleClear} className="btn-danger flex items-center gap-1"><Trash2 className="w-4 h-4" /> Limpar</button>
        </div>
      </div>

      <div className="card">
        <div className="font-mono text-sm">
          <div className="divide-y divide-gray-100">
            {logs.map(log => (
              <div key={log.id} className="px-5 py-2 flex items-start gap-3 hover:bg-gray-50">
                <span className={`flex-shrink-0 ${levelColors[log.level] || 'badge-gray'}`}>{log.level.toUpperCase()}</span>
                <span className="text-gray-400 flex-shrink-0">{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                {log.whatsapp && <span className="text-blue-500 flex-shrink-0">[{log.whatsapp.name}]</span>}
                <span className="text-gray-700 flex-1">{log.message}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="p-12 text-center text-gray-400">
                <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Nenhum log registrado
              </div>
            )}
          </div>
        </div>
      </div>

      {total > 100 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-sm">Anterior</button>
          <span className="text-sm text-gray-500">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= total} className="btn-secondary text-sm">Próxima</button>
        </div>
      )}
    </div>
  );
}
