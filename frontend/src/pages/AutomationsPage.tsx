import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck, Loader2, Plus, Send, Users, Workflow, X } from 'lucide-react';
import { automationApi, whatsappApi, type Automation } from '../lib/api';

export function AutomationStatusBadge({ status }: { status: Automation['status'] }) {
  if (status === 'ACTIVE') return <span className="badge-green gap-1"><Send className="w-3 h-3" /> Enviando</span>;
  if (status === 'PAUSED') return <span className="badge-yellow">Pausada</span>;
  return <span className="badge-gray">Rascunho</span>;
}

export default function AutomationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('Revisão de apólice — Prudential');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    automationApi.list().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
    whatsappApi.list()
      .then(data => {
        const sorted = [...data].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
        setAccounts(sorted);
        const carol = sorted.find((a: any) => /carol/i.test(a.name || ''));
        setAccountId((carol || sorted[0])?.id || '');
      })
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    setError('');
    if (!name.trim()) return setError('Dê um nome para a automação.');
    if (!accountId) return setError('Escolha o WhatsApp que fará os envios.');
    setCreating(true);
    try {
      const created = await automationApi.create({ name: name.trim(), whatsappId: accountId });
      navigate(`/automacoes/${created.id}`);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível criar a automação.');
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="section-title">Automações</h2>
          <p className="text-sm text-monte-sereno mt-1">
            Convide clientes para marcar reunião: eles recebem os horários livres da agenda e confirmam pelo link.
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova automação
        </button>
      </div>

      {loading ? (
        <div className="card-static p-16 text-center"><Loader2 className="w-8 h-8 mx-auto animate-spin text-monte-verde" /></div>
      ) : items.length === 0 ? (
        <div className="card-static p-14 text-center text-monte-sereno">
          <Workflow className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-display font-semibold text-monte-azul">Nenhuma automação ainda</p>
          <p className="text-sm mt-1 max-w-md mx-auto">
            Exemplo: enviar para todos os clientes Prudential os horários livres da Carol para a revisão de apólice.
          </p>
          <button onClick={() => setShowNew(true)} className="btn-secondary mt-5 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Criar a primeira
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map(item => (
            <Link key={item.id} to={`/automacoes/${item.id}`} className="card-static p-5 hover:shadow-md transition-shadow block">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display font-bold text-monte-azul truncate">{item.name}</p>
                  <p className="text-xs text-monte-sereno mt-0.5">
                    {item.meetingTitle} · via {item.whatsapp?.name || 'WhatsApp'}
                  </p>
                </div>
                <AutomationStatusBadge status={item.status} />
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                <Stat icon={<Users className="w-3.5 h-3.5" />} label="Clientes" value={item.stats.total} />
                <Stat icon={<Send className="w-3.5 h-3.5" />} label="Enviadas" value={item.stats.SENT} />
                <Stat icon={<CalendarCheck className="w-3.5 h-3.5" />} label="Reuniões" value={item.stats.booked} highlight />
              </div>
              {item.lastError && <p className="text-xs text-monte-terracota mt-3">{item.lastError}</p>}
            </Link>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-[10000] bg-monte-azul/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-t-4xl sm:rounded-4xl w-full max-w-md shadow-2xl p-6 space-y-4" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Nova automação">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold font-display text-monte-azul">Nova automação de agendamento</h3>
              <button onClick={() => setShowNew(false)} className="p-2 rounded-full text-monte-sereno hover:bg-monte-areiaSecao" title="Fechar"><X className="w-5 h-5" /></button>
            </div>
            <div>
              <label className="block text-sm font-medium text-monte-azul mb-1.5">Nome</label>
              <input className="input-rect" value={name} onChange={e => setName(e.target.value)} maxLength={120} />
            </div>
            <div>
              <label className="block text-sm font-medium text-monte-azul mb-1.5">Enviar pelo WhatsApp</label>
              <select className="input-rect" value={accountId} onChange={e => setAccountId(e.target.value)}>
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-monte-sereno">
              Já vem configurada com as 15 agendas da Carol, horário comercial (seg a sex, 9h–12h e 13h30–18h) e reuniões de 30 min. Tudo pode ser ajustado em seguida.
            </p>
            {error && <p className="text-sm text-monte-terracota bg-monte-terracota/10 rounded-2xl px-4 py-2.5" role="alert">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowNew(false)} className="btn-secondary flex-1" disabled={creating}>Cancelar</button>
              <button onClick={handleCreate} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl px-3 py-2 ${highlight ? 'bg-monte-verde/10 text-monte-verde' : 'bg-monte-areiaSecao/70 text-monte-azul'}`}>
      <div className="flex items-center gap-1 text-[11px] font-semibold opacity-80">{icon}{label}</div>
      <p className="text-lg font-bold font-display">{value}</p>
    </div>
  );
}
