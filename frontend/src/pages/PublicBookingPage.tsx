import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarCheck, CalendarDays, Clock, Loader2 } from 'lucide-react';

interface SlotDay { key: string; label: string; slots: Array<{ start: string; label: string }> }
interface BookingInfo {
  firstName: string;
  meetingTitle: string;
  durationMinutes: number;
  bookingOpen: boolean;
  booking: { start: string; dateLabel: string; timeLabel: string } | null;
  days: SlotDay[];
}

async function request(token: string, init?: RequestInit): Promise<BookingInfo> {
  const res = await fetch(`/api/public/agendamento/${encodeURIComponent(token)}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Não foi possível carregar os horários.');
  return data;
}

/**
 * Página aberta pelo cliente a partir do link da mensagem (sem login).
 * Mostra os horários livres naquele momento e confirma a reunião com um toque.
 */
export default function PublicBookingPage() {
  const { token = '' } = useParams();
  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dayKey, setDayKey] = useState('');
  const [chosen, setChosen] = useState('');
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [justBooked, setJustBooked] = useState(false);

  useEffect(() => {
    document.title = 'Agendar reunião';
    request(token)
      .then(data => { setInfo(data); setDayKey(data.days[0]?.key || ''); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const day = useMemo(() => info?.days.find(d => d.key === dayKey) || info?.days[0], [info, dayKey]);

  const confirm = async () => {
    if (!chosen) return;
    setSaving(true);
    setError('');
    try {
      const data = await request(token, { method: 'POST', body: JSON.stringify({ start: chosen }) });
      setInfo(data);
      setChosen('');
      setChanging(false);
      setJustBooked(true);
    } catch (err: any) {
      setError(err.message);
      request(token).then(data => { setInfo(data); if (!data.days.some(d => d.key === dayKey)) setDayKey(data.days[0]?.key || ''); }).catch(() => {});
      setChosen('');
    } finally {
      setSaving(false);
    }
  };

  const showPicker = info && info.bookingOpen && (!info.booking || changing);

  return (
    <div className="min-h-screen bg-monte-areia flex flex-col items-center px-4 py-8 sm:py-14">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-3xl bg-monte-verde text-white flex items-center justify-center mx-auto shadow-md">
            <CalendarDays className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold font-display text-monte-azul mt-4">
            {info?.firstName ? `Olá, ${info.firstName}!` : 'Agende sua reunião'}
          </h1>
          {info && (
            <p className="text-sm text-monte-sereno mt-1">
              {info.meetingTitle} com a Carol · {info.durationMinutes} min
            </p>
          )}
        </div>

        <div className="bg-white rounded-4xl shadow-xl p-5 sm:p-6">
          {loading ? (
            <div className="py-14 text-center"><Loader2 className="w-8 h-8 mx-auto animate-spin text-monte-verde" /></div>
          ) : !info ? (
            <p className="py-10 text-center text-sm text-monte-terracota">{error || 'Link inválido.'}</p>
          ) : (
            <>
              {info.booking && !changing && (
                <div className="text-center py-4">
                  <CalendarCheck className="w-12 h-12 mx-auto text-monte-verde" />
                  <p className="text-lg font-bold font-display text-monte-azul mt-3">
                    {justBooked ? 'Reunião confirmada!' : 'Sua reunião está marcada'}
                  </p>
                  <p className="text-monte-azul mt-1 capitalize">{info.booking.dateLabel} às {info.booking.timeLabel}</p>
                  {justBooked && <p className="text-sm text-monte-sereno mt-2">Você também vai receber a confirmação no WhatsApp.</p>}
                  {info.bookingOpen && (
                    <button onClick={() => { setChanging(true); setJustBooked(false); }} className="mt-5 text-sm font-semibold text-monte-verde underline">
                      Preciso trocar o horário
                    </button>
                  )}
                </div>
              )}

              {!info.bookingOpen && !info.booking && (
                <p className="py-8 text-center text-sm text-monte-sereno">
                  Os agendamentos por este link foram encerrados. Responda a mensagem no WhatsApp para combinar um horário.
                </p>
              )}

              {showPicker && (info.days.length === 0 ? (
                <p className="py-8 text-center text-sm text-monte-sereno">
                  No momento não há horários livres. Responda a mensagem no WhatsApp que a Carol combina um horário com você.
                </p>
              ) : (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-monte-azul mb-2">Escolha o dia</p>
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                      {info.days.map(d => {
                        const [weekday, date] = d.label.split(', ');
                        return (
                          <button
                            key={d.key}
                            onClick={() => { setDayKey(d.key); setChosen(''); }}
                            className={`flex-shrink-0 rounded-2xl px-3.5 py-2.5 text-center border transition-colors ${
                              day?.key === d.key ? 'bg-monte-verde text-white border-monte-verde' : 'bg-white text-monte-azul border-monte-sereno/20 hover:border-monte-verde'
                            }`}
                          >
                            <span className="block text-[11px] font-semibold capitalize opacity-80">{weekday?.replace('-feira', '')}</span>
                            <span className="block text-sm font-bold">{date}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {day && (
                    <div>
                      <p className="text-sm font-semibold text-monte-azul mb-2">Horários livres</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {day.slots.map(s => (
                          <button
                            key={s.start}
                            onClick={() => setChosen(s.start)}
                            className={`rounded-2xl py-2.5 text-sm font-semibold border transition-colors ${
                              chosen === s.start ? 'bg-monte-azul text-white border-monte-azul' : 'bg-monte-areiaSecao/60 text-monte-azul border-transparent hover:border-monte-verde'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {error && <p className="text-sm text-monte-terracota bg-monte-terracota/10 rounded-2xl px-4 py-2.5" role="alert">{error}</p>}
                  <button onClick={confirm} disabled={!chosen || saving} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                    {chosen ? `Confirmar ${day?.label.split(', ')[1]} às ${day?.slots.find(s => s.start === chosen)?.label}` : 'Escolha um horário'}
                  </button>
                  {changing && (
                    <button onClick={() => { setChanging(false); setChosen(''); setError(''); }} className="w-full text-sm text-monte-sereno">Manter o horário atual</button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
        <p className="text-center text-xs text-monte-sereno mt-6">Horários de Brasília</p>
      </div>
    </div>
  );
}
