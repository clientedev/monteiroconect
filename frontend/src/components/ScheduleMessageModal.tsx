import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, Loader2, Search, User as UserIcon, X } from 'lucide-react';
import { authApi, contactApi, scheduledApi, type ScheduledMessage } from '../lib/api';

export interface ScheduleTarget {
  accountId: string;
  accountName?: string;
  to: string;
  contactName?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (item: ScheduledMessage) => void;
  /** Contas disponíveis para escolher (tela de Agendamentos). */
  accounts?: any[];
  /** Destino fixo (aberto de dentro de uma conversa): não mostra a busca de contato. */
  target?: ScheduleTarget | null;
  /** Agendamento em edição ou sendo reagendado. */
  editing?: ScheduledMessage | null;
  initialContent?: string;
  defaultSenderName?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTimeInput = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function formatPhone(phone: string): string {
  if (phone.includes('@')) return phone.endsWith('@g.us') ? 'Grupo' : 'Contato do WhatsApp';
  const d = phone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.startsWith('55') && d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return phone;
}

function quickOptions(): Array<{ label: string; date: Date }> {
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const todayEvening = new Date(now); todayEvening.setHours(18, 0, 0, 0);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
  const monday = new Date(now);
  monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  monday.setHours(9, 0, 0, 0);
  const options = [{ label: 'Em 1 hora', date: inOneHour }];
  if (todayEvening.getTime() - now.getTime() > 30 * 60 * 1000) options.push({ label: 'Hoje às 18h', date: todayEvening });
  options.push({ label: 'Amanhã às 9h', date: tomorrow });
  if (monday.toDateString() !== tomorrow.toDateString()) options.push({ label: 'Segunda às 9h', date: monday });
  return options;
}

export default function ScheduleMessageModal({
  open, onClose, onSaved, accounts = [], target, editing, initialContent = '', defaultSenderName = '',
}: Props) {
  const [accountId, setAccountId] = useState('');
  const [to, setTo] = useState('');
  const [contactName, setContactName] = useState<string | null>(null);
  const [contactQuery, setContactQuery] = useState('');
  const [contactResults, setContactResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [content, setContent] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [senderName, setSenderName] = useState('');
  const [attendants, setAttendants] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textRef = useRef<HTMLTextAreaElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const fixedTarget = editing
    ? { accountId: editing.whatsappId, accountName: editing.whatsapp?.name, to: editing.toPhone, contactName: editing.contactName }
    : target || null;

  // Preenche o formulário sempre que o modal abre
  useEffect(() => {
    if (!open) return;
    setError('');
    setSaving(false);
    setContactQuery('');
    setContactResults([]);
    if (editing) {
      const when = new Date(editing.scheduledAt);
      const base = when.getTime() > Date.now() ? when : new Date(Date.now() + 60 * 60 * 1000);
      setAccountId(editing.whatsappId);
      setTo(editing.toPhone);
      setContactName(editing.contactName || null);
      setContent(editing.content);
      setDate(toDateInput(base));
      setTime(toTimeInput(base));
      setSenderName(editing.senderName || '');
    } else {
      const base = new Date(Date.now() + 60 * 60 * 1000);
      setAccountId(target?.accountId || accounts[0]?.id || '');
      setTo(target?.to || '');
      setContactName(target?.contactName || null);
      setContent(initialContent);
      setDate(toDateInput(base));
      setTime(toTimeInput(base));
      setSenderName(defaultSenderName);
    }
    // Com destino definido o foco vai direto para a mensagem; senão, para a busca de contato.
    setTimeout(() => (editing || target ? textRef.current : searchRef.current)?.focus(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  useEffect(() => {
    if (!open || attendants.length > 0) return;
    authApi.listUsers()
      .then(users => setAttendants((users || []).filter((u: any) => u.isActive && u.showInSendAs !== false)))
      .catch(() => {});
  }, [open, attendants.length]);

  // Busca de contatos (apenas quando o destino não é fixo)
  useEffect(() => {
    if (!open || fixedTarget || !accountId) return;
    const query = contactQuery.trim();
    if (query.length < 2) { setContactResults([]); setSearching(false); return; }
    setSearching(true);
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const data = await contactApi.list(accountId, query, 1, 8);
        if (active) setContactResults(data.contacts || []);
      } catch {
        if (active) setContactResults([]);
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [open, fixedTarget, accountId, contactQuery]);

  const typedDigits = contactQuery.replace(/\D/g, '');
  const canUseTypedNumber = !fixedTarget && !to && typedDigits.length >= 10 && typedDigits.length <= 13
    && !/[a-zA-Z]/.test(contactQuery);

  const scheduledDate = useMemo(() => {
    if (!date || !time) return null;
    const parsed = new Date(`${date}T${time}:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [date, time]);
  const isPast = scheduledDate ? scheduledDate.getTime() <= Date.now() : false;

  if (!open) return null;

  const handleSave = async () => {
    setError('');
    const destination = to || (canUseTypedNumber ? typedDigits : '');
    if (!accountId) return setError('Escolha o WhatsApp que fará o envio.');
    if (!destination) return setError('Escolha um contato ou digite o número com DDD.');
    if (!content.trim()) return setError('Escreva a mensagem.');
    if (!scheduledDate) return setError('Informe a data e a hora do envio.');
    if (isPast) return setError('Escolha uma data e hora no futuro.');

    setSaving(true);
    try {
      const saved = editing
        ? await scheduledApi.update(editing.id, {
            content: content.trim(),
            scheduledAt: scheduledDate.toISOString(),
            senderName: senderName || null,
          })
        : await scheduledApi.create({
            accountId,
            to: destination,
            contactName,
            content: content.trim(),
            scheduledAt: scheduledDate.toISOString(),
            senderName: senderName || null,
          });
      onSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar o agendamento.');
    } finally {
      setSaving(false);
    }
  };

  const title = editing
    ? (editing.status === 'PENDING' ? 'Editar agendamento' : 'Reagendar mensagem')
    : 'Agendar mensagem';

  // Portal no <body>: garante que o modal cubra a tela inteira mesmo dentro do Modo Foco / janela destacada.
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-monte-azul/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-4xl sm:rounded-4xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-monte-verde/10 text-monte-verde flex items-center justify-center">
              <CalendarClock className="w-5 h-5" />
            </div>
            <h3 className="text-xl font-bold font-display text-monte-azul">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full text-monte-sereno hover:text-monte-azul hover:bg-monte-areiaSecao transition-colors" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 pb-2 space-y-4 overflow-y-auto">
          {/* Destino */}
          {fixedTarget ? (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-monte-areiaSecao/70 border border-monte-sereno/15">
              <div className="w-9 h-9 rounded-full bg-white text-monte-verde flex items-center justify-center flex-shrink-0">
                <UserIcon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-monte-azul truncate">
                  {fixedTarget.contactName || formatPhone(fixedTarget.to)}
                </p>
                <p className="text-xs text-monte-sereno truncate">
                  {fixedTarget.contactName ? `${formatPhone(fixedTarget.to)} · ` : ''}
                  {fixedTarget.accountName ? `via ${fixedTarget.accountName}` : 'WhatsApp'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {accounts.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-monte-azul mb-1.5">Enviar pelo WhatsApp</label>
                  <select
                    className="input-rect"
                    value={accountId}
                    onChange={e => { setAccountId(e.target.value); setTo(''); setContactName(null); setContactResults([]); }}
                  >
                    {accounts.map((account: any) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-monte-azul mb-1.5">Contato</label>
                {to ? (
                  <div className="flex items-center gap-3 p-3 rounded-2xl bg-monte-areiaSecao/70 border border-monte-sereno/15">
                    <div className="w-9 h-9 rounded-full bg-white text-monte-verde flex items-center justify-center flex-shrink-0">
                      <UserIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-monte-azul truncate">{contactName || formatPhone(to)}</p>
                      {contactName && <p className="text-xs text-monte-sereno truncate">{formatPhone(to)}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setTo(''); setContactName(null); }}
                      className="text-xs font-semibold text-monte-verde hover:text-monte-azul px-2 py-1"
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-4 top-3 w-4 h-4 text-monte-sereno pointer-events-none" />
                    <input
                      ref={searchRef}
                      type="text"
                      className="input-rect pl-10"
                      placeholder="Busque pelo nome ou digite o número com DDD"
                      value={contactQuery}
                      onChange={e => setContactQuery(e.target.value)}
                    />
                    {searching && <Loader2 className="absolute right-4 top-3 w-4 h-4 text-monte-verde animate-spin" />}
                    {(contactResults.length > 0 || canUseTypedNumber) && (
                      <div className="mt-2 rounded-2xl border border-monte-sereno/20 overflow-hidden divide-y divide-monte-sereno/10 max-h-52 overflow-y-auto">
                        {contactResults.map((c: any) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => { setTo(c.phone); setContactName(c.name || null); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-monte-areiaSecao transition-colors"
                          >
                            <p className="text-sm font-semibold text-monte-azul truncate">{c.name || formatPhone(c.phone)}</p>
                            {c.name && <p className="text-xs text-monte-sereno truncate">{formatPhone(c.phone)}</p>}
                          </button>
                        ))}
                        {canUseTypedNumber && (
                          <button
                            type="button"
                            onClick={() => { setTo(typedDigits); setContactName(null); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-monte-areiaSecao transition-colors"
                          >
                            <p className="text-sm font-semibold text-monte-verde">Usar o número {contactQuery.trim()}</p>
                          </button>
                        )}
                      </div>
                    )}
                    {!searching && contactQuery.trim().length >= 2 && contactResults.length === 0 && !canUseTypedNumber && (
                      <p className="text-xs text-monte-sereno mt-2 px-1">Nenhum contato encontrado. Para um número novo, digite DDD + número.</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Mensagem */}
          <div>
            <label className="block text-sm font-medium text-monte-azul mb-1.5">Mensagem</label>
            <textarea
              ref={textRef}
              className="input-rect resize-none leading-relaxed"
              rows={4}
              maxLength={4096}
              placeholder="Escreva a mensagem que será enviada no horário escolhido"
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>

          {/* Quando */}
          <div>
            <label className="block text-sm font-medium text-monte-azul mb-1.5">Quando enviar</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {quickOptions().map(option => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => { setDate(toDateInput(option.date)); setTime(toTimeInput(option.date)); }}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-monte-areiaSecao text-monte-azul hover:bg-monte-verde hover:text-white transition-colors"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                className="input-rect"
                aria-label="Data do envio"
                min={toDateInput(new Date())}
                value={date}
                onChange={e => setDate(e.target.value)}
              />
              <input
                type="time"
                className="input-rect"
                aria-label="Hora do envio"
                value={time}
                onChange={e => setTime(e.target.value)}
              />
            </div>
            {scheduledDate && !isPast && (
              <p className="text-xs text-monte-sereno mt-2 px-1">
                Será enviada {scheduledDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })} às {toTimeInput(scheduledDate)}.
              </p>
            )}
            {isPast && <p className="text-xs text-monte-terracota mt-2 px-1">Esse horário já passou. Escolha um horário no futuro.</p>}
          </div>

          {attendants.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-monte-azul mb-1.5">Enviar como</label>
              <select className="input-rect" value={senderName} onChange={e => setSenderName(e.target.value)}>
                <option value="">Sem identificação</option>
                {attendants.map((attendant: any) => (
                  <option key={attendant.id} value={attendant.username}>{attendant.username}</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="text-sm text-monte-terracota bg-monte-terracota/10 rounded-2xl px-4 py-2.5" role="alert">{error}</p>
          )}
        </div>

        <div className="flex gap-3 px-6 py-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1" disabled={saving}>Cancelar</button>
          <button type="button" onClick={handleSave} className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            {editing ? 'Salvar' : 'Agendar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
