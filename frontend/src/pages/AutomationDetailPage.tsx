import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CalendarCheck, CalendarDays, Check, CheckCircle2, ClipboardPaste, Copy, Building2,
  Loader2, MessageSquare, Pause, Play, Plus, RefreshCw, Save, Send, Tag, Trash2, Users, X, XCircle,
} from 'lucide-react';
import {
  authApi, automationApi, tagApi,
  type Automation, type AutomationBooking, type AutomationPreview, type AutomationRecipient, type WorkingHours,
} from '../lib/api';
import { AutomationStatusBadge } from './AutomationsPage';

type Tab = 'clientes' | 'agenda' | 'mensagem' | 'reunioes';

const WEEKDAYS = [
  { key: '1', label: 'Segunda' }, { key: '2', label: 'Terça' }, { key: '3', label: 'Quarta' },
  { key: '4', label: 'Quinta' }, { key: '5', label: 'Sexta' }, { key: '6', label: 'Sábado' }, { key: '0', label: 'Domingo' },
];

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.startsWith('55') && d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return phone;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function AutomationDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [automation, setAutomation] = useState<Automation | null>(null);
  const [draft, setDraft] = useState<Automation | null>(null);
  const [tab, setTab] = useState<Tab>('clientes');
  const [preview, setPreview] = useState<AutomationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [attendants, setAttendants] = useState<any[]>([]);

  const flash = (type: 'ok' | 'error', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(n => (n?.text === text ? null : n)), 6000);
  };

  const load = useCallback(async () => {
    const data = await automationApi.get(id);
    setAutomation(data);
    setDraft(d => (d && d.id === data.id ? { ...data, ...pickEditable(d, data) } : data));
    return data;
  }, [id]);

  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      setPreview(await automationApi.preview(id));
    } catch (err: any) {
      setPreview(null);
      flash('error', err?.message || 'Não foi possível calcular os horários.');
    } finally {
      setPreviewLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load().catch(() => navigate('/automacoes'));
    loadPreview();
    authApi.listUsers()
      .then(users => setAttendants((users || []).filter((u: any) => u.isActive && u.showInSendAs !== false)))
      .catch(() => {});
  }, [load, loadPreview, navigate]);

  // Atualiza os números enquanto os envios acontecem
  useEffect(() => {
    if (automation?.status !== 'ACTIVE') return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load().catch(() => {}); }, 20000);
    return () => clearInterval(timer);
  }, [automation?.status, load]);

  const dirty = useMemo(() => {
    if (!automation || !draft) return false;
    return JSON.stringify(pickEditable(draft, automation)) !== JSON.stringify(pickEditable(automation, automation));
  }, [automation, draft]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await automationApi.update(id, pickEditable(draft, draft));
      setAutomation(updated);
      setDraft(updated);
      flash('ok', 'Alterações salvas.');
      loadPreview();
    } catch (err: any) {
      flash('error', err?.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSending = async () => {
    if (!automation) return;
    if (dirty) return flash('error', 'Salve as alterações antes de iniciar os envios.');
    if (automation.status !== 'ACTIVE') {
      const pending = automation.stats.PENDING;
      if (!confirm(`Iniciar os envios para ${pending} cliente(s)? As mensagens saem uma por vez, com intervalo de 25 a 50 segundos, das ${automation.sendWindowStart} às ${automation.sendWindowEnd} (segunda a sábado).`)) return;
    }
    setBusy(true);
    try {
      const updated = automation.status === 'ACTIVE' ? await automationApi.pause(id) : await automationApi.start(id);
      setAutomation(updated);
      setDraft(updated);
      flash('ok', updated.status === 'ACTIVE' ? 'Envios iniciados.' : 'Envios pausados.');
    } catch (err: any) {
      flash('error', err?.message || 'Não foi possível alterar os envios.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!automation) return;
    if (!confirm(`Excluir a automação "${automation.name}"? Os links já enviados deixarão de funcionar.`)) return;
    try {
      await automationApi.remove(id);
      navigate('/automacoes');
    } catch (err: any) {
      flash('error', err?.message || 'Não foi possível excluir.');
    }
  };

  if (!automation || !draft) {
    return <div className="card-static p-16 text-center"><Loader2 className="w-8 h-8 mx-auto animate-spin text-monte-verde" /></div>;
  }

  const set = <K extends keyof Automation>(key: K, value: Automation[K]) => setDraft(d => (d ? { ...d, [key]: value } : d));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Link to="/automacoes" className="text-xs font-semibold text-monte-sereno hover:text-monte-verde inline-flex items-center gap-1 mb-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Automações
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="section-title truncate">{automation.name}</h2>
            <AutomationStatusBadge status={automation.status} />
          </div>
          <p className="text-sm text-monte-sereno mt-1">{automation.meetingTitle} · via {automation.whatsapp?.name || 'WhatsApp'}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button onClick={save} disabled={saving} className="btn-secondary flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar
            </button>
          )}
          <button onClick={toggleSending} disabled={busy} className="btn-primary flex items-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : automation.status === 'ACTIVE' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {automation.status === 'ACTIVE' ? 'Pausar envios' : 'Iniciar envios'}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${notice.type === 'ok' ? 'bg-monte-verde/10 text-monte-verde' : 'bg-monte-terracota/10 text-monte-terracota'}`} role="status">
          {notice.text}
        </div>
      )}
      {automation.lastError && (
        <div className="rounded-2xl px-4 py-3 text-sm bg-monte-terracota/10 text-monte-terracota flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {automation.lastError}
        </div>
      )}

      <CalendarAccessCard preview={preview} loading={previewLoading} onRefresh={loadPreview} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Clientes na lista" value={automation.stats.total} />
        <StatCard label="Aguardando envio" value={automation.stats.PENDING} />
        <StatCard label="Mensagens enviadas" value={automation.stats.SENT} />
        <StatCard label="Reuniões marcadas" value={automation.stats.booked} highlight />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {([
          ['clientes', 'Clientes', Users], ['agenda', 'Agenda e horários', CalendarDays],
          ['mensagem', 'Mensagem', MessageSquare], ['reunioes', 'Reuniões marcadas', CalendarCheck],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-all inline-flex items-center gap-1.5 ${
              tab === key ? 'bg-monte-verde text-white shadow-sm' : 'bg-white/70 text-monte-sereno hover:text-monte-azul hover:bg-white'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'clientes' && <RecipientsTab automation={automation} onChanged={() => load()} flash={flash} />}
      {tab === 'agenda' && <ScheduleTab draft={draft} set={set} preview={preview} />}
      {tab === 'mensagem' && <MessageTab draft={draft} set={set} preview={preview} attendants={attendants} dirty={dirty} />}
      {tab === 'reunioes' && <BookingsTab automationId={id} flash={flash} onChanged={() => load()} />}

      <div className="pt-4 border-t border-monte-sereno/15 flex justify-end">
        <button onClick={remove} className="text-xs font-semibold text-monte-sereno hover:text-monte-terracota inline-flex items-center gap-1.5">
          <Trash2 className="w-3.5 h-3.5" /> Excluir automação
        </button>
      </div>
    </div>
  );
}

function pickEditable(source: Automation, _ref: Automation): Partial<Automation> {
  return {
    name: source.name, calendars: source.calendars.map(c => ({ id: c.id, name: c.name })), targetCalendarId: source.targetCalendarId,
    meetingTitle: source.meetingTitle, durationMinutes: source.durationMinutes, bufferMinutes: source.bufferMinutes,
    daysAhead: source.daysAhead, minNoticeHours: source.minNoticeHours, slotsInMessage: source.slotsInMessage,
    workingHours: source.workingHours, skipHolidays: source.skipHolidays, messageTemplate: source.messageTemplate,
    confirmationTemplate: source.confirmationTemplate, senderName: source.senderName,
    sendWindowStart: source.sendWindowStart, sendWindowEnd: source.sendWindowEnd, bookingOpen: source.bookingOpen,
  };
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-3xl px-4 py-3 ${highlight ? 'bg-monte-verde text-white' : 'bg-white/80 text-monte-azul'}`}>
      <p className={`text-xs font-semibold ${highlight ? 'text-white/80' : 'text-monte-sereno'}`}>{label}</p>
      <p className="text-2xl font-bold font-display">{value}</p>
    </div>
  );
}

function CalendarAccessCard({ preview, loading, onRefresh }: { preview: AutomationPreview | null; loading: boolean; onRefresh: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!preview) return null;
  const blocked = preview.calendars.filter(c => c.ok === false);
  if (!preview.calendarError && blocked.length === 0) {
    return (
      <div className="rounded-2xl px-4 py-3 text-sm bg-monte-verde/10 text-monte-verde flex items-center justify-between gap-2">
        <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Agendas conectadas — {preview.totalSlots} horários livres nos próximos dias.</span>
        <button onClick={onRefresh} className="p-1.5 rounded-full hover:bg-white/60" title="Atualizar"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
    );
  }
  const email = preview.serviceAccountEmail;
  return (
    <div className="card-static p-5 border border-monte-terracota/30">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-monte-terracota flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-display font-bold text-monte-azul">
            {preview.calendarError && blocked.length === preview.calendars.length
              ? 'O sistema ainda não consegue ver as agendas da Carol'
              : preview.calendarError || `${blocked.length} agenda(s) ainda sem acesso`}
          </p>
          {email ? (
            <>
              <p className="text-sm text-monte-azul/80">
                Peça para a Carol compartilhar as agendas com o e-mail abaixo (Google Agenda → Configurações da agenda → Compartilhar com pessoas específicas).
                A permissão <strong>“Ver apenas livre/ocupado”</strong> é suficiente — o sistema nunca lê o nome dos compromissos. Na agenda <strong>Reunião</strong>, use
                <strong> “Fazer alterações nos eventos”</strong> para as reuniões marcadas entrarem sozinhas na agenda dela.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="px-3 py-1.5 rounded-xl bg-monte-areiaSecao text-monte-azul text-xs break-all">{email}</code>
                <button
                  onClick={() => { navigator.clipboard?.writeText(email).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); }}
                  className="text-xs font-semibold text-monte-verde inline-flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-monte-azul/80">A conta de serviço do Google não está configurada no servidor (GOOGLE_SERVICE_ACCOUNT_JSON).</p>
          )}
          {blocked.length > 0 && blocked.length < preview.calendars.length && (
            <p className="text-xs text-monte-sereno">Sem acesso: {blocked.map(b => b.name).join(', ')}</p>
          )}
          <p className="text-xs text-monte-sereno">Enquanto isso, os envios ficam bloqueados para não oferecer um horário em que a Carol esteja ocupada.</p>
        </div>
        <button onClick={onRefresh} className="p-2 rounded-full text-monte-sereno hover:bg-monte-areiaSecao" title="Verificar de novo">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── Clientes ─────────────────────────

const RECIPIENT_STATUS: Record<AutomationRecipient['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Na fila', cls: 'badge-blue' },
  SENDING: { label: 'Enviando', cls: 'badge-yellow' },
  SENT: { label: 'Enviada', cls: 'badge-green' },
  FAILED: { label: 'Falhou', cls: 'badge-red' },
  SKIPPED: { label: 'Ignorado', cls: 'badge-gray' },
};

function RecipientsTab({ automation, onChanged, flash }: { automation: Automation; onChanged: () => void; flash: (t: 'ok' | 'error', m: string) => void }) {
  const [items, setItems] = useState<AutomationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<null | 'crm' | 'tag' | 'paste'>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    automationApi.recipients(automation.id).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, [automation.id]);
  useEffect(() => { load(); }, [load, automation.stats.SENT, automation.stats.total]);

  const add = async (source: string, list: Array<{ phone: string; name?: string | null }>) => {
    const res = await automationApi.addRecipients(automation.id, source, list);
    flash('ok', `${res.added} cliente(s) adicionado(s)${res.duplicates ? ` · ${res.duplicates} já estavam na lista` : ''}${res.invalid ? ` · ${res.invalid} número(s) inválido(s)` : ''}.`);
    setAdding(null);
    load();
    onChanged();
  };

  const remove = async (r: AutomationRecipient) => {
    try {
      await automationApi.removeRecipient(automation.id, r.id);
      load();
      onChanged();
    } catch (err: any) {
      flash('error', err?.message || 'Não foi possível remover.');
    }
  };

  const retry = async () => {
    const res = await automationApi.retryFailed(automation.id);
    flash('ok', `${res.requeued} envio(s) voltaram para a fila.`);
    load();
    onChanged();
  };

  const q = filter.trim().toLowerCase();
  const visible = q ? items.filter(i => (i.name || '').toLowerCase().includes(q) || i.phone.includes(q.replace(/\D/g, '') || '§')) : items;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setAdding('crm')} className="btn-secondary flex items-center gap-2 text-sm"><Building2 className="w-4 h-4" /> Clientes do CRM por seguradora</button>
        <button onClick={() => setAdding('tag')} className="btn-secondary flex items-center gap-2 text-sm"><Tag className="w-4 h-4" /> Por etiqueta</button>
        <button onClick={() => setAdding('paste')} className="btn-secondary flex items-center gap-2 text-sm"><ClipboardPaste className="w-4 h-4" /> Colar lista</button>
        {automation.stats.FAILED > 0 && (
          <button onClick={retry} className="text-sm font-semibold text-monte-terracota inline-flex items-center gap-1.5 px-3"><RefreshCw className="w-4 h-4" /> Reenviar {automation.stats.FAILED} falha(s)</button>
        )}
      </div>

      {adding === 'crm' && <CrmPicker onCancel={() => setAdding(null)} onAdd={add} />}
      {adding === 'tag' && <TagPicker whatsappId={automation.whatsappId} onCancel={() => setAdding(null)} onAdd={add} />}
      {adding === 'paste' && <PastePicker onCancel={() => setAdding(null)} onAdd={add} />}

      <div className="card-static overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-monte-sereno/10">
          <p className="text-sm font-semibold text-monte-azul">{items.length} cliente(s)</p>
          {items.length > 8 && (
            <input className="input-rect max-w-[220px] py-1.5 text-sm" placeholder="Buscar nome ou número" value={filter} onChange={e => setFilter(e.target.value)} />
          )}
        </div>
        {loading ? (
          <div className="p-10 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-monte-verde" /></div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-monte-sereno">
            Nenhum cliente ainda. Use “Clientes do CRM por seguradora” para puxar, por exemplo, todos os clientes Prudential.
          </div>
        ) : (
          <div className="divide-y divide-monte-sereno/10 max-h-[520px] overflow-y-auto">
            {visible.map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-monte-azul truncate">{r.name || formatPhone(r.phone)}</p>
                  <p className="text-xs text-monte-sereno truncate">
                    {r.name ? formatPhone(r.phone) : ''}{r.source ? `${r.name ? ' · ' : ''}${r.source.replace(/^crm:/, 'CRM · ').replace(/^tag:/, 'Etiqueta · ')}` : ''}
                    {r.status === 'FAILED' && r.lastError ? ` · ${r.lastError}` : ''}
                  </p>
                </div>
                {r.bookedAt ? (
                  <span className="badge-green gap-1"><CalendarCheck className="w-3 h-3" /> {formatDateTime(r.bookedAt)}</span>
                ) : r.openedAt ? (
                  <span className="badge-blue">Abriu o link</span>
                ) : (
                  <span className={RECIPIENT_STATUS[r.status]?.cls || 'badge-gray'}>{RECIPIENT_STATUS[r.status]?.label || r.status}</span>
                )}
                {r.status !== 'SENT' && r.status !== 'SENDING' && (
                  <button onClick={() => remove(r)} className="p-1.5 rounded-full text-monte-sereno hover:text-monte-terracota" title="Remover da lista"><X className="w-4 h-4" /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PickerShell({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="card-static p-5 space-y-4 border border-monte-verde/30">
      <div className="flex items-center justify-between">
        <p className="font-display font-bold text-monte-azul">{title}</p>
        <button onClick={onCancel} className="p-1.5 rounded-full text-monte-sereno hover:bg-monte-areiaSecao" title="Fechar"><X className="w-4 h-4" /></button>
      </div>
      {children}
    </div>
  );
}

function SelectableList({ rows, onAdd, source }: {
  rows: Array<{ name: string | null; phone: string; extra?: string }>;
  source: string;
  onAdd: (source: string, list: Array<{ phone: string; name?: string | null }>) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.map(r => r.phone)));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setSelected(new Set(rows.map(r => r.phone))); }, [rows]);
  const toggle = (phone: string) => setSelected(s => { const n = new Set(s); n.has(phone) ? n.delete(phone) : n.add(phone); return n; });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-monte-azul font-semibold">{selected.size} de {rows.length} selecionado(s)</span>
        <button className="text-xs font-semibold text-monte-verde" onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map(r => r.phone)))}>
          {selected.size === rows.length ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
      </div>
      <div className="rounded-2xl border border-monte-sereno/15 divide-y divide-monte-sereno/10 max-h-72 overflow-y-auto">
        {rows.map(r => (
          <label key={r.phone} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-monte-areiaSecao/50">
            <input type="checkbox" className="accent-monte-verde w-4 h-4" checked={selected.has(r.phone)} onChange={() => toggle(r.phone)} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-monte-azul truncate">{r.name || formatPhone(r.phone)}</span>
              <span className="block text-xs text-monte-sereno truncate">{formatPhone(r.phone)}{r.extra ? ` · ${r.extra}` : ''}</span>
            </span>
          </label>
        ))}
      </div>
      <button
        disabled={selected.size === 0 || saving}
        onClick={async () => { setSaving(true); try { await onAdd(source, rows.filter(r => selected.has(r.phone)).map(r => ({ phone: r.phone, name: r.name }))); } finally { setSaving(false); } }}
        className="btn-primary flex items-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar {selected.size} à lista
      </button>
    </div>
  );
}

function CrmPicker({ onCancel, onAdd }: { onCancel: () => void; onAdd: (s: string, l: any[]) => Promise<void> }) {
  const [insurers, setInsurers] = useState<Array<{ name: string; clients: number }>>([]);
  const [insurer, setInsurer] = useState('');
  const [rows, setRows] = useState<Array<{ name: string | null; phone: string; extra?: string }> | null>(null);
  const [withoutPhone, setWithoutPhone] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    automationApi.crmInsurers()
      .then(list => {
        setInsurers(list);
        const pru = list.find(i => /prudential/i.test(i.name));
        setInsurer(pru?.name || 'Prudential');
      })
      .catch(err => { setError(err?.message || 'CRM indisponível'); setInsurer('Prudential'); });
  }, []);

  const search = async () => {
    setLoading(true); setError(''); setRows(null);
    try {
      const data = await automationApi.crmClients(insurer);
      setRows(data.clients.map(c => ({ name: c.name, phone: c.phone, extra: [c.insurers, c.policies ? `${c.policies} apólice(s)` : ''].filter(Boolean).join(' · ') })));
      setWithoutPhone(data.withoutPhone);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível consultar o CRM.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PickerShell title="Clientes do CRM por seguradora" onCancel={onCancel}>
      <div className="flex gap-2 flex-wrap">
        <input className="input-rect flex-1 min-w-[200px]" list="crm-insurers" value={insurer} onChange={e => setInsurer(e.target.value)} placeholder="Ex.: Prudential" />
        <datalist id="crm-insurers">{insurers.map(i => <option key={i.name} value={i.name}>{`${i.clients} cliente(s)`}</option>)}</datalist>
        <button onClick={search} disabled={loading || insurer.trim().length < 2} className="btn-primary flex items-center gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />} Buscar clientes
        </button>
      </div>
      {error && <p className="text-sm text-monte-terracota">{error}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-monte-sereno">Nenhum cliente com telefone encontrado para “{insurer}”.</p>}
      {rows && rows.length > 0 && (
        <>
          {withoutPhone > 0 && <p className="text-xs text-monte-sereno">{withoutPhone} cliente(s) dessa seguradora estão sem telefone no CRM e ficaram de fora.</p>}
          <SelectableList rows={rows} source={`crm:${insurer}`} onAdd={onAdd} />
        </>
      )}
    </PickerShell>
  );
}

function TagPicker({ whatsappId, onCancel, onAdd }: { whatsappId: string; onCancel: () => void; onAdd: (s: string, l: any[]) => Promise<void> }) {
  const [tags, setTags] = useState<any[]>([]);
  const [tagId, setTagId] = useState('');
  const [rows, setRows] = useState<Array<{ name: string | null; phone: string }> | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { tagApi.list().then(setTags).catch(() => {}); }, []);
  useEffect(() => {
    if (!tagId) return;
    setLoading(true);
    automationApi.tagContacts(whatsappId, tagId).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [tagId, whatsappId]);
  const tagName = tags.find(t => t.id === tagId)?.name || '';
  return (
    <PickerShell title="Contatos por etiqueta" onCancel={onCancel}>
      <select className="input-rect" value={tagId} onChange={e => setTagId(e.target.value)}>
        <option value="">Escolha uma etiqueta</option>
        {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {loading && <Loader2 className="w-5 h-5 animate-spin text-monte-verde" />}
      {rows && !loading && (rows.length === 0
        ? <p className="text-sm text-monte-sereno">Nenhum contato com essa etiqueta neste WhatsApp.</p>
        : <SelectableList rows={rows} source={`tag:${tagName}`} onAdd={onAdd} />)}
    </PickerShell>
  );
}

function PastePicker({ onCancel, onAdd }: { onCancel: () => void; onAdd: (s: string, l: any[]) => Promise<void> }) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const phoneMatch = line.match(/(\+?\d[\d\s().-]{8,}\d)/);
    const phone = phoneMatch ? phoneMatch[1] : '';
    const name = line.replace(phone, '').replace(/[;,\t|-]+/g, ' ').trim() || null;
    return { phone, name };
  }).filter(r => r.phone), [text]);
  return (
    <PickerShell title="Colar lista de clientes" onCancel={onCancel}>
      <p className="text-xs text-monte-sereno">Um cliente por linha: nome e telefone com DDD (pode copiar direto de uma planilha).</p>
      <textarea className="input-rect resize-none font-mono text-sm" rows={6} value={text} onChange={e => setText(e.target.value)} placeholder={'Maria Souza; 11 98765-4321\nJoão Lima\t(11) 97654-3210'} />
      <button
        disabled={parsed.length === 0 || saving}
        onClick={async () => { setSaving(true); try { await onAdd('lista colada', parsed); } finally { setSaving(false); } }}
        className="btn-primary flex items-center gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Adicionar {parsed.length} cliente(s)
      </button>
    </PickerShell>
  );
}

// ───────────────────────── Agenda e horários ─────────────────────────

function ScheduleTab({ draft, set, preview }: { draft: Automation; set: <K extends keyof Automation>(k: K, v: Automation[K]) => void; preview: AutomationPreview | null }) {
  const wh = draft.workingHours || {};
  const setDay = (day: string, windows: Array<[string, string]>) => {
    const next: WorkingHours = { ...wh };
    if (windows.length) next[day] = windows; else delete next[day];
    set('workingHours', next);
  };
  const toggleCalendar = (calId: string) => {
    const status = preview?.calendars.find(c => c.id === calId);
    const exists = draft.calendars.some(c => c.id === calId);
    if (exists) set('calendars', draft.calendars.filter(c => c.id !== calId));
    else set('calendars', [...draft.calendars, { id: calId, name: status?.name || calId }]);
  };
  const allCalendars = useMemo(() => {
    const map = new Map<string, { id: string; name: string; ok?: boolean | null; error?: string }>();
    for (const c of preview?.calendars || []) map.set(c.id, c);
    for (const c of draft.calendars) if (!map.has(c.id)) map.set(c.id, c);
    return Array.from(map.values());
  }, [preview, draft.calendars]);

  const num = (key: 'durationMinutes' | 'bufferMinutes' | 'daysAhead' | 'minNoticeHours', label: string, suffix: string, min: number, max: number) => (
    <label className="block">
      <span className="block text-sm font-medium text-monte-azul mb-1.5">{label}</span>
      <div className="flex items-center gap-2">
        <input type="number" className="input-rect w-24" min={min} max={max} value={draft[key]} onChange={e => set(key, Number(e.target.value) as any)} />
        <span className="text-sm text-monte-sereno">{suffix}</span>
      </div>
    </label>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card-static p-5 space-y-4">
        <p className="font-display font-bold text-monte-azul">Reunião</p>
        <label className="block">
          <span className="block text-sm font-medium text-monte-azul mb-1.5">Nome da reunião</span>
          <input className="input-rect" value={draft.meetingTitle} onChange={e => set('meetingTitle', e.target.value)} maxLength={80} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          {num('durationMinutes', 'Duração', 'min', 10, 240)}
          {num('bufferMinutes', 'Folga entre compromissos', 'min', 0, 120)}
          {num('daysAhead', 'Oferecer horários dos próximos', 'dias', 1, 60)}
          {num('minNoticeHours', 'Antecedência mínima', 'horas', 0, 168)}
        </div>
        <label className="flex items-center gap-2 text-sm text-monte-azul">
          <input type="checkbox" className="accent-monte-verde w-4 h-4" checked={draft.skipHolidays} onChange={e => set('skipHolidays', e.target.checked)} />
          Não oferecer feriados nacionais
        </label>
        <label className="flex items-center gap-2 text-sm text-monte-azul">
          <input type="checkbox" className="accent-monte-verde w-4 h-4" checked={draft.bookingOpen} onChange={e => set('bookingOpen', e.target.checked)} />
          Link de agendamento aberto para os clientes
        </label>
      </div>

      <div className="card-static p-5 space-y-3">
        <p className="font-display font-bold text-monte-azul">Horários de atendimento</p>
        {WEEKDAYS.map(day => {
          const windows = wh[day.key] || [];
          return (
            <div key={day.key} className="flex items-start gap-3">
              <label className="flex items-center gap-2 w-28 pt-2 text-sm font-medium text-monte-azul">
                <input
                  type="checkbox" className="accent-monte-verde w-4 h-4" checked={windows.length > 0}
                  onChange={e => setDay(day.key, e.target.checked ? [['09:00', '12:00'], ['13:30', '18:00']] : [])}
                />
                {day.label}
              </label>
              <div className="flex-1 space-y-1.5">
                {windows.length === 0 && <p className="text-sm text-monte-sereno pt-2">Sem atendimento</p>}
                {windows.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="time" className="input-rect py-1.5 w-32 px-3" value={w[0]} onChange={e => setDay(day.key, windows.map((x, j) => (j === i ? [e.target.value, x[1]] : x)) as any)} />
                    <span className="text-monte-sereno text-sm">até</span>
                    <input type="time" className="input-rect py-1.5 w-32 px-3" value={w[1]} onChange={e => setDay(day.key, windows.map((x, j) => (j === i ? [x[0], e.target.value] : x)) as any)} />
                    <button onClick={() => setDay(day.key, windows.filter((_, j) => j !== i))} className="p-1 text-monte-sereno hover:text-monte-terracota" title="Remover período"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                {windows.length > 0 && windows.length < 4 && (
                  <button onClick={() => setDay(day.key, [...windows, ['14:00', '15:00']])} className="text-xs font-semibold text-monte-verde">+ período</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card-static p-5 space-y-3 lg:col-span-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="font-display font-bold text-monte-azul">Agendas consideradas</p>
          <p className="text-xs text-monte-sereno">Qualquer compromisso nestas agendas bloqueia o horário.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {allCalendars.map(cal => {
            const active = draft.calendars.some(c => c.id === cal.id);
            const isTarget = draft.targetCalendarId === cal.id;
            return (
              <div key={cal.id} className={`rounded-2xl border px-3 py-2.5 ${active ? 'border-monte-verde/40 bg-monte-verde/5' : 'border-monte-sereno/15'}`}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="accent-monte-verde w-4 h-4" checked={active} onChange={() => toggleCalendar(cal.id)} />
                  <span className="text-sm font-semibold text-monte-azul truncate flex-1">{cal.name}</span>
                  {cal.ok === true && <CheckCircle2 className="w-4 h-4 text-monte-verde flex-shrink-0" aria-label="Acesso OK" />}
                  {cal.ok === false && <XCircle className="w-4 h-4 text-monte-terracota flex-shrink-0" aria-label={cal.error} />}
                </label>
                <button
                  onClick={() => set('targetCalendarId', isTarget ? null : cal.id)}
                  className={`mt-1 text-[11px] font-semibold ${isTarget ? 'text-monte-verde' : 'text-monte-sereno hover:text-monte-verde'}`}
                >
                  {isTarget ? '✓ Reuniões marcadas são gravadas aqui' : 'Gravar reuniões marcadas aqui'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card-static p-5 space-y-3 lg:col-span-2">
        <p className="font-display font-bold text-monte-azul">Horários livres agora {preview ? `(${preview.totalSlots})` : ''}</p>
        <p className="text-xs text-monte-sereno">Calculado com as regras salvas. Salve as alterações para atualizar.</p>
        {!preview || preview.days.length === 0 ? (
          <p className="text-sm text-monte-sereno">Nenhum horário livre com as regras atuais.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {preview.days.slice(0, 12).map(day => (
              <div key={day.key} className="rounded-2xl bg-monte-areiaSecao/60 px-3 py-2.5">
                <p className="text-xs font-bold text-monte-azul capitalize">{day.label}</p>
                <p className="text-xs text-monte-azul/80 mt-1 leading-relaxed">{day.slots.map(s => s.label).join(' · ')}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Mensagem ─────────────────────────

function MessageTab({ draft, set, preview, attendants, dirty }: {
  draft: Automation; set: <K extends keyof Automation>(k: K, v: Automation[K]) => void;
  preview: AutomationPreview | null; attendants: any[]; dirty: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card-static p-5 space-y-4">
        <div>
          <p className="font-display font-bold text-monte-azul">Mensagem de convite</p>
          <p className="text-xs text-monte-sereno mt-1">
            Use <code>{'{primeiro_nome}'}</code>, <code>{'{nome}'}</code>, <code>{'{horarios}'}</code> (próximos horários livres) e <code>{'{link}'}</code> (página onde o cliente confirma).
          </p>
        </div>
        <textarea className="input-rect resize-none leading-relaxed text-sm" rows={14} value={draft.messageTemplate} onChange={e => set('messageTemplate', e.target.value)} maxLength={3000} />
        <label className="block">
          <span className="block text-sm font-medium text-monte-azul mb-1.5">Quantos horários mostrar na mensagem</span>
          <input type="number" className="input-rect w-24" min={1} max={12} value={draft.slotsInMessage} onChange={e => set('slotsInMessage', Number(e.target.value))} />
        </label>
        <div>
          <p className="font-display font-bold text-monte-azul">Confirmação enviada ao cliente</p>
          <p className="text-xs text-monte-sereno mt-1">Use <code>{'{primeiro_nome}'}</code>, <code>{'{data}'}</code>, <code>{'{hora}'}</code>, <code>{'{titulo}'}</code> e <code>{'{link}'}</code>.</p>
        </div>
        <textarea className="input-rect resize-none leading-relaxed text-sm" rows={5} value={draft.confirmationTemplate} onChange={e => set('confirmationTemplate', e.target.value)} maxLength={1500} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-monte-azul mb-1.5">Enviar entre</span>
            <div className="flex items-center gap-2">
              <input type="time" className="input-rect py-1.5" value={draft.sendWindowStart} onChange={e => set('sendWindowStart', e.target.value)} />
              <span className="text-sm text-monte-sereno">e</span>
              <input type="time" className="input-rect py-1.5" value={draft.sendWindowEnd} onChange={e => set('sendWindowEnd', e.target.value)} />
            </div>
          </label>
          {attendants.length > 0 && (
            <label className="block">
              <span className="block text-sm font-medium text-monte-azul mb-1.5">Enviar como</span>
              <select className="input-rect" value={draft.senderName || ''} onChange={e => set('senderName', e.target.value || null)}>
                <option value="">Sem identificação</option>
                {attendants.map((a: any) => <option key={a.id} value={a.username}>{a.username}</option>)}
              </select>
            </label>
          )}
        </div>
        <p className="text-xs text-monte-sereno">Envio de segunda a sábado, um por vez, com 25 a 50 segundos entre mensagens (proteção contra bloqueio).</p>
      </div>

      <div className="card-static p-5 space-y-3 h-fit">
        <p className="font-display font-bold text-monte-azul">Como o cliente vai receber</p>
        {dirty && <p className="text-xs text-monte-terracota">Salve para atualizar a prévia com o texto novo.</p>}
        <div className="rounded-3xl bg-[#e5ddd5] p-4">
          <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm ml-auto max-w-[92%]">
            <p className="text-sm text-[#111b21] whitespace-pre-wrap break-words">{preview?.message || '—'}</p>
          </div>
        </div>
        <p className="text-xs text-monte-sereno">Na prévia aparece o primeiro cliente da lista (ou um nome de exemplo). O link é pessoal para cada cliente.</p>
      </div>
    </div>
  );
}

// ───────────────────────── Reuniões ─────────────────────────

function BookingsTab({ automationId, flash, onChanged }: { automationId: string; flash: (t: 'ok' | 'error', m: string) => void; onChanged: () => void }) {
  const [items, setItems] = useState<AutomationBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    automationApi.bookings(automationId).then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }, [automationId]);
  useEffect(() => { load(); }, [load]);

  const cancel = async (b: AutomationBooking) => {
    if (!confirm(`Cancelar a reunião de ${b.name || formatPhone(b.phone)} (${formatDateTime(b.startAt)})? O horário volta a ficar livre. O cliente não é avisado automaticamente.`)) return;
    try {
      await automationApi.cancelBooking(automationId, b.id);
      flash('ok', 'Reunião cancelada.');
      load();
      onChanged();
    } catch (err: any) {
      flash('error', err?.message || 'Não foi possível cancelar.');
    }
  };

  const upcoming = items.filter(b => b.status === 'CONFIRMED');
  const canceled = items.filter(b => b.status !== 'CONFIRMED');

  if (loading) return <div className="card-static p-10 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-monte-verde" /></div>;
  if (items.length === 0) {
    return (
      <div className="card-static p-12 text-center text-monte-sereno">
        <CalendarCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Nenhuma reunião marcada ainda. Elas aparecem aqui assim que o cliente confirma pelo link.</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {upcoming.map(b => (
        <div key={b.id} className="card-static p-4 flex items-center gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-2xl bg-monte-verde/10 text-monte-verde flex items-center justify-center flex-shrink-0"><CalendarCheck className="w-6 h-6" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-monte-azul">{formatDateTime(b.startAt)}</p>
            <p className="text-sm text-monte-azul/80 truncate">{b.name || 'Cliente'} · {formatPhone(b.phone)}</p>
            {b.calendarEventId ? (
              <p className="text-xs text-monte-verde mt-0.5">Gravada na agenda</p>
            ) : b.calendarError ? (
              <p className="text-xs text-monte-terracota mt-0.5">Não entrou na agenda: {b.calendarError}</p>
            ) : null}
          </div>
          <Link to="/conversations" className="text-xs font-semibold text-monte-verde inline-flex items-center gap-1"><Send className="w-3.5 h-3.5" /> Conversa</Link>
          <button onClick={() => cancel(b)} className="text-xs font-semibold text-monte-sereno hover:text-monte-terracota">Cancelar</button>
        </div>
      ))}
      {canceled.length > 0 && (
        <details className="card-static p-4">
          <summary className="text-sm font-semibold text-monte-sereno cursor-pointer">{canceled.length} cancelada(s) ou remarcada(s)</summary>
          <div className="mt-3 space-y-1.5">
            {canceled.map(b => (
              <p key={b.id} className="text-xs text-monte-sereno">{formatDateTime(b.startAt)} · {b.name || formatPhone(b.phone)} · {b.canceledBy || 'cancelada'}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
