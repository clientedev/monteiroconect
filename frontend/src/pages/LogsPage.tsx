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
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="section-title">Logs do Sistema</h2>
        <div className="flex gap-2">
          <select className="input-rect w-auto" value={level} onChange={e => { setLevel(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="info">INFO</option>
            <option value="warning">WARNING</option>
            <option value="error">ERROR</option>
          </select>
          <button onClick={load} className="btn-secondary px-3 flex items-center gap-1"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={handleClear} className="btn-danger px-3 flex items-center gap-1"><Trash2 className="w-4 h-4" /> Limpar</button>
        </div>
      </div>

      <div className="card-static overflow-hidden">
        <div className="font-mono text-sm">
          <div className="divide-y divide-monte-sereno/10">
            {logs.map(log => (
              <div key={log.id} className="px-5 py-2.5 flex items-start gap-3 hover:bg-monte-areiaSecao/40 transition-colors">
                <span className={`flex-shrink-0 ${levelColors[log.level] || 'badge-gray'}`}>{log.level.toUpperCase()}</span>
                <span className="text-monte-sereno flex-shrink-0 text-xs">{new Date(log.createdAt).toLocaleString('pt-BR')}</span>
                {log.whatsapp && <span className="text-sky-500 flex-shrink-0 text-xs">[{log.whatsapp.name}]</span>}
                <span className="text-monte-azul/80 flex-1">{log.message}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="p-12 text-center text-monte-sereno">
                <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Nenhum log registrado
              </div>
            )}
          </div>
        </div>
      </div>

      {total > 100 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary text-sm">Anterior</button>
          <span className="text-sm text-monte-sereno">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= total} className="btn-secondary text-sm">Próxima</button>
        </div>
      )}
    </div>
  );
}
