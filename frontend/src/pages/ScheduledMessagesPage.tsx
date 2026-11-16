import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Ban, CalendarClock, CheckCircle2, Clock, Edit2, Loader2, Plus, RefreshCw, Trash2,
} from 'lucide-react';
import { scheduledApi, whatsappApi, type ScheduledMessage } from '../lib/api';
import ScheduleMessageModal from '../components/ScheduleMessageModal';

type Tab = 'pending' | 'sent' | 'failed';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'pending', label: 'Agendadas' },
  { id: 'sent', label: 'Enviadas' },
  { id: 'failed', label: 'Não enviadas' },
];

function formatPhone(phone: string): string {
  if (phone.includes('@')) return phone.endsWith('@g.us') ? 'Grupo' : 'Contato do WhatsApp';
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.startsWith('55') && d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return phone;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `Hoje às ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Amanhã às ${time}`;
  const day = date.toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
  return `${day} às ${time}`;
}

function StatusBadge({ item }: { item: ScheduledMessage }) {
  switch (item.status) {
    case 'PENDING':
      return <span className="badge-blue gap-1"><Clock className="w-3 h-3" /> Agendada</span>;
    case 'SENDING':
      return <span className="badge-yellow gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Enviando</span>;
    case 'SENT':
      return <span className="badge-green gap-1"><CheckCircle2 className="w-3 h-3" /> Enviada</span>;
    case 'CANCELED':
      return <span className="badge-gray gap-1"><Ban className="w-3 h-3" /> Cancelada</span>;
    default:
      return <span className="badge-red gap-1"><AlertTriangle className="w-3 h-3" /> Falhou</span>;
  }
}

export default function ScheduledMessagesPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [items, setItems] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledMessage | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setItems(await scheduledApi.list(tab));
    } catch {
      if (!silent) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  // Mantém a lista atualizada enquanto a tela está aberta (os envios acontecem no servidor)
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    whatsappApi.list()
      .then(data => setAccounts([...data].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'pt-BR'))))
      .catch(() => {});
  }, []);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (item: ScheduledMessage) => { setEditing(item); setModalOpen(true); };

  const handleCancel = async (item: ScheduledMessage) => {
    if (!confirm(`Cancelar o envio para ${item.contactName || formatPhone(item.toPhone)}?`)) return;
    setBusyId(item.id);
    try {
      await scheduledApi.cancel(item.id);
      await load(true);
    } catch (err: any) {
      alert(err?.message || 'Não foi possível cancelar.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: ScheduledMessage) => {
    if (!confirm('Remover este registro da lista?')) return;
    setBusyId(item.id);
    try {
      await scheduledApi.delete(item.id);
      await load(true);
    } catch (err: any) {
      alert(err?.message || 'Não foi possível remover.');
    } finally {
      setBusyId(null);
    }
  };

  const emptyText: Record<Tab, string> = {
    pending: 'Nenhuma mensagem agendada',
    sent: 'Nenhuma mensagem agendada foi enviada ainda',
    failed: 'Nenhum envio falhou ou foi cancelado',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="section-title">Agendamentos</h2>
          <p className="text-sm text-monte-sereno mt-1">
            Programe uma mensagem para um contato e ela é enviada sozinha no horário escolhido.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Agendar mensagem
        </button>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
              tab === t.id
                ? 'bg-monte-verde text-white shadow-sm'
                : 'bg-white/70 text-monte-sereno hover:text-monte-azul hover:bg-white'
            }`}
          >
            {t.label}
            {t.id === 'pending' && tab === 'pending' && items.length > 0 ? ` (${items.length})` : ''}
          </button>
        ))}
        <button
          onClick={() => load()}
          className="ml-auto p-2 rounded-full text-monte-sereno hover:text-monte-verde hover:bg-white transition-colors"
          title="Atualizar lista"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && items.length === 0 ? (
        <div className="card-static p-16 text-center text-monte-sereno">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-monte-verde" />
        </div>
      ) : items.length === 0 ? (
        <div className="card-static p-16 text-center text-monte-sereno">
          <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-display font-semibold">{emptyText[tab]}</p>
          {tab === 'pending' && (
            <button onClick={openNew} className="btn-secondary mt-5 inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Agendar a primeira
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="card-static p-5">
              <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-monte-azul truncate">
                      {item.contactName || formatPhone(item.toPhone)}
                    </span>
                    {item.contactName && (
                      <span className="text-xs text-monte-sereno">{formatPhone(item.toPhone)}</span>
                    )}
                    <StatusBadge item={item} />
                  </div>
                  <p className="text-sm text-monte-azul/80 mt-2 whitespace-pre-wrap break-words line-clamp-3">
                    {item.content}
                  </p>
                  <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-3 text-xs text-monte-sereno">
                    <span className="flex items-center gap-1.5 font-semibold text-monte-azul">
                      <CalendarClock className="w-3.5 h-3.5 text-monte-verde" />
                      {item.status === 'SENT' && item.sentAt ? `Enviada ${formatWhen(item.sentAt).toLowerCase()}` : formatWhen(item.scheduledAt)}
                    </span>
                    {item.whatsapp?.name && <span>via {item.whatsapp.name}</span>}
                    {item.senderName && <span>como {item.senderName}</span>}
                    {item.createdByName && <span>agendada por {item.createdByName}</span>}
                  </div>
                  {item.status === 'FAILED' && item.lastError && (
                    <p className="text-xs text-monte-terracota mt-2">{item.lastError}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                  {item.status === 'PENDING' && (
                    <>
                      <button onClick={() => openEdit(item)} disabled={busyId === item.id} className="p-2 rounded-full text-monte-sereno hover:text-monte-verde hover:bg-monte-areiaSecao transition-colors" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleCancel(item)} disabled={busyId === item.id} className="p-2 rounded-full text-monte-sereno hover:text-monte-terracota hover:bg-monte-areiaSecao transition-colors" title="Cancelar envio">
                        <Ban className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {(item.status === 'FAILED' || item.status === 'CANCELED') && (
                    <button onClick={() => openEdit(item)} disabled={busyId === item.id} className="px-3 py-1.5 rounded-full text-xs font-semibold text-monte-verde hover:bg-monte-areiaSecao transition-colors" title="Escolher um novo horário">
                      Reagendar
                    </button>
                  )}
                  {item.status !== 'PENDING' && item.status !== 'SENDING' && (
                    <button onClick={() => handleDelete(item)} disabled={busyId === item.id} className="p-2 rounded-full text-monte-sereno hover:text-monte-terracota hover:bg-monte-areiaSecao transition-colors" title="Remover da lista">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ScheduleMessageModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { if (tab === 'pending') load(true); else setTab('pending'); }}
        accounts={accounts}
        editing={editing}
      />
    </div>
  );
}
