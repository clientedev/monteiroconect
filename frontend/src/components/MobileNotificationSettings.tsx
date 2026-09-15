import { useState } from 'react';
import { useNotification, NotificationTonePreset, IosDisplayMode } from '../context/NotificationContext';
import {
  Bell, BellOff, Volume2, VolumeX, Smartphone, Play, Check, Vibrate, Sparkles, Layers, ListFilter
} from 'lucide-react';

export default function MobileNotificationSettings() {
  const {
    muted,
    setMuted,
    soundPreset,
    setSoundPreset,
    volume,
    setVolume,
    iosDisplayMode,
    setIosDisplayMode,
    vibration,
    setVibration,
    browserPushEnabled,
    requestBrowserPushPermission,
    testNotificationSound,
    triggerNotification,
  } = useNotification();

  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [simulatedCount, setSimulatedCount] = useState(3);

  const handleTestSound = (preset?: NotificationTonePreset) => {
    setIsPlayingTest(true);
    testNotificationSound(preset);
    setTimeout(() => setIsPlayingTest(false), 800);
  };

  const handleLiveTestPush = () => {
    handleTestSound();
    triggerNotification(
      'Mariana Santos',
      simulatedCount,
      'Olá! Gostaria de confirmar se meu pedido já foi enviado?',
      'conv-demo',
      'acc-demo'
    );
  };

  const tonesList: { id: NotificationTonePreset; label: string; desc: string }[] = [
    { id: 'suave', label: 'Suave Clean (Padrão)', desc: 'Duplo tom harmônico cristalino e bem discreto' },
    { id: 'ios', label: 'iOS Crystal', desc: 'Sino triplo reluzente inspirado no iPhone' },
    { id: 'pop', label: 'Pop Suave', desc: 'Efeito gota d\'água extremamente suave' },
    { id: 'zen', label: 'Harmônico Zen', desc: 'Acorde relaxante de baixa frequência' },
    { id: 'silent', label: 'Silencioso', desc: 'Sem toque sonoro' },
  ];

  const displayModesList: { id: IosDisplayMode; label: string; icon: any; desc: string }[] = [
    {
      id: 'banner',
      label: 'Banner (Notch / Dynamic Island)',
      icon: Smartphone,
      desc: 'Notificação flutuante no topo estilo iOS com avatar, nome e prévia',
    },
    {
      id: 'stack',
      label: 'Empilhadas (Stack)',
      icon: Layers,
      desc: 'Notificações acumuladas em pilhas separadas por contato',
    },
    {
      id: 'count',
      label: 'Contagem (Count)',
      icon: ListFilter,
      desc: 'Apenas pílula minimalista indicando total de mensagens não lidas',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="card-static p-6 bg-gradient-to-r from-monte-azul via-slate-900 to-monte-azul text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-monte-verde/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 text-monte-verde shadow-inner">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold font-display leading-snug">Notificações no Dispositivo Móvel (iPhone / Celular)</h3>
              <p className="text-xs text-white/70 mt-0.5">
                Configure o formato de chegada, toques limpos e jeitos de exibição das notificações no dispositivo.
              </p>
            </div>
          </div>

          {/* Quick Mute / Allow Switch */}
          <button
            type="button"
            onClick={() => setMuted(!muted)}
            className={`flex items-center gap-3 px-5 py-3 rounded-2xl font-bold text-sm transition-all duration-300 shadow-md ${
              muted
                ? 'bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-monte-verde text-white hover:bg-emerald-600 border border-emerald-400/40'
            }`}
          >
            {muted ? (
              <>
                <BellOff className="w-5 h-5 animate-bounce" />
                <span>Notificações Multadas</span>
              </>
            ) : (
              <>
                <Bell className="w-5 h-5" />
                <span>Notificações Permitidas</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Settings Column */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 1: Mute & Sound Controls */}
          <div className="card-static p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-monte-sereno/15 pb-4">
              <div>
                <h4 className="text-base font-bold font-display text-monte-azul flex items-center gap-2">
                  <Bell className="w-4 h-4 text-monte-verde" />
                  Estado das Notificações
                </h4>
                <p className="text-xs text-monte-sereno mt-0.5">
                  Ligue ou desligue o recebimento de alertas no celular
                </p>
              </div>

              {/* iOS Style Switch */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={!muted}
                  onChange={(e) => setMuted(!e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-14 h-8 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-7 after:w-7 after:transition-all peer-checked:bg-monte-verde" />
              </label>
            </div>

            {/* Toque Suave (Clean Sound Selector) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h5 className="text-sm font-bold text-monte-azul flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-monte-verde" />
                  Toque Suave da Notificação (Clean Sound)
                </h5>
                <button
                  type="button"
                  onClick={() => handleTestSound()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    isPlayingTest
                      ? 'bg-monte-verde text-white scale-105 shadow-md'
                      : 'bg-monte-verde/10 text-monte-verde hover:bg-monte-verde/20'
                  }`}
                >
                  <Play className={`w-3.5 h-3.5 ${isPlayingTest ? 'animate-spin' : ''}`} />
                  {isPlayingTest ? 'Tocando...' : 'Ouvir toque suave'}
                </button>
              </div>

              {/* Presets Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tonesList.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSoundPreset(t.id);
                      if (t.id !== 'silent') handleTestSound(t.id);
                    }}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      soundPreset === t.id
                        ? 'bg-monte-verde/10 border-monte-verde shadow-xs'
                        : 'bg-white/60 border-monte-sereno/15 hover:border-monte-sereno/30 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-monte-azul">{t.label}</span>
                      {soundPreset === t.id && (
                        <span className="w-4 h-4 rounded-full bg-monte-verde text-white flex items-center justify-center text-[10px]">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-monte-sereno mt-1 leading-tight">{t.desc}</p>
                  </div>
                ))}
              </div>

              {/* Volume Slider */}
              {soundPreset !== 'silent' && (
                <div className="pt-2">
                  <div className="flex items-center justify-between text-xs text-monte-sereno mb-1.5">
                    <span className="font-semibold text-monte-azul">Volume do Toque</span>
                    <span className="font-bold text-monte-verde">{Math.round(volume * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <VolumeX className="w-4 h-4 text-monte-sereno" />
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-full h-2 bg-monte-sereno/20 rounded-lg appearance-none cursor-pointer accent-monte-verde"
                    />
                    <Volume2 className="w-4 h-4 text-monte-verde" />
                  </div>
                </div>
              )}
            </div>

            {/* Vibration Toggle */}
            <div className="flex items-center justify-between pt-3 border-t border-monte-sereno/15">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Vibrate className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-monte-azul">Vibração no Dispositivo</p>
                  <p className="text-xs text-monte-sereno">Vibrar o celular ao chegar nova notificação</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={vibration}
                onChange={(e) => setVibration(e.target.checked)}
                className="w-5 h-5 rounded border-monte-sereno text-monte-verde focus:ring-monte-verde cursor-pointer"
              />
            </div>
          </div>

          {/* Section 2: iPhone / Mobile Display Styles */}
          <div className="card-static p-6 space-y-4">
            <h4 className="text-base font-bold font-display text-monte-azul flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-monte-verde" />
              Jeitos de Exibição no iPhone / Mobile
            </h4>
            <p className="text-xs text-monte-sereno">
              Escolha o formato como os alertas flutuam no seu celular quando chegarem mensagens.
            </p>

            <div className="space-y-3">
              {displayModesList.map((m) => {
                const IconComponent = m.icon;
                const isSelected = iosDisplayMode === m.id;
                return (
                  <div
                    key={m.id}
                    onClick={() => setIosDisplayMode(m.id)}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center gap-4 ${
                      isSelected
                        ? 'bg-monte-verde/10 border-monte-verde ring-1 ring-monte-verde shadow-xs'
                        : 'bg-white/60 border-monte-sereno/15 hover:border-monte-sereno/30 hover:bg-white'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-monte-verde text-white' : 'bg-monte-sereno/15 text-monte-azul'
                    }`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-monte-azul">{m.label}</p>
                      <p className="text-xs text-monte-sereno mt-0.5">{m.desc}</p>
                    </div>
                    {isSelected && (
                      <span className="w-6 h-6 rounded-full bg-monte-verde text-white flex items-center justify-center text-xs font-bold">
                        ✓
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Browser Push Notification */}
          <div className="card-static p-6 space-y-3 bg-gradient-to-br from-emerald-50/50 to-teal-50/40 border-emerald-200/50">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-monte-azul flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-monte-verde" />
                  Notificações de Servidor / Navegador (Web Push)
                </h4>
                <p className="text-xs text-monte-sereno mt-1">
                  Receba alertas diretamente no sistema de notificações do seu celular ou computador, mesmo se o app estiver em segundo plano.
                </p>
              </div>

              <button
                type="button"
                onClick={requestBrowserPushPermission}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex-shrink-0 ${
                  browserPushEnabled
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-monte-verde text-white hover:bg-emerald-600 shadow-md'
                }`}
              >
                {browserPushEnabled ? 'Notificações Ativas ✓' : 'Ativar Notificações Push'}
              </button>
            </div>
          </div>
        </div>

        {/* Live iPhone Simulator Column */}
        <div className="lg:col-span-5">
          <div className="sticky top-6 card-static p-6 space-y-5 bg-slate-900 text-white border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h4 className="text-sm font-bold font-display text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  Simulador do iPhone (Prévia ao vivo)
                </h4>
                <p className="text-[11px] text-white/60">
                  Veja exatamente como a notificação com <span className="text-emerald-300 font-bold">Nome do Contato + N mensagens não lidas</span> chega no dispositivo.
                </p>
              </div>

              <button
                type="button"
                onClick={handleLiveTestPush}
                className="px-3 py-1.5 bg-monte-verde text-white rounded-full text-xs font-bold hover:bg-emerald-600 transition-transform active:scale-95 flex items-center gap-1 shadow-md flex-shrink-0"
              >
                <Play className="w-3 h-3 fill-current" />
                Testar
              </button>
            </div>

            {/* iPhone Frame */}
            <div className="relative mx-auto w-full max-w-[290px] h-[520px] bg-slate-950 rounded-[44px] p-3 border-4 border-slate-800 shadow-2xl overflow-hidden flex flex-col justify-between">
              {/* iPhone Dynamic Island / Notch */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-30 flex items-center justify-end px-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 animate-pulse" />
              </div>

              {/* Status Bar */}
              <div className="flex items-center justify-between text-[11px] font-semibold text-white px-5 pt-2 z-20">
                <span>09:41</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px]">5G</span>
                  <div className="w-5 h-2.5 rounded-xs border border-white p-0.5 flex items-center">
                    <div className="w-full h-full bg-white rounded-2xs" />
                  </div>
                </div>
              </div>

              {/* Lockscreen Wallpaper & Notification Container */}
              <div className="relative flex-1 flex flex-col items-center pt-8 px-2 overflow-hidden">
                <p className="text-4xl font-light text-white tracking-tighter">09:41</p>
                <p className="text-xs text-white/60 font-medium mt-1">Terça-feira, 15 de Setembro</p>

                {/* Simulated Notification Cards based on selected display mode */}
                <div className="w-full mt-6 space-y-3 z-10">
                  {muted ? (
                    <div className="bg-red-500/20 backdrop-blur-md border border-red-500/30 rounded-2xl p-3 text-center">
                      <BellOff className="w-6 h-6 text-red-400 mx-auto mb-1" />
                      <p className="text-xs font-bold text-red-300">Notificações Silenciadas</p>
                      <p className="text-[10px] text-red-200/80 mt-0.5">Nenhum alerta sonoro ou banner será exibido.</p>
                    </div>
                  ) : iosDisplayMode === 'banner' ? (
                    <div className="animate-in fade-in slide-in-from-top-4 duration-300 bg-white/10 backdrop-blur-xl border border-white/20 p-3 rounded-2xl text-left shadow-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">Monteiro Conecta</span>
                        <span className="text-[9px] text-white/50">agora</span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white font-bold text-xs flex items-center justify-center flex-shrink-0">
                          M
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">Mariana Santos</p>
                          <p className="text-[10px] font-semibold text-emerald-300">
                            {simulatedCount === 1 ? '1 mensagem não lida' : `${simulatedCount} mensagens não lidas`}
                          </p>
                          <p className="text-[11px] text-white/80 truncate mt-0.5">
                            Olá! Gostaria de confirmar se meu pedido já foi enviado?
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : iosDisplayMode === 'stack' ? (
                    <div className="relative animate-in fade-in slide-in-from-top-4 duration-300">
                      <div className="absolute top-1 left-2 right-2 h-10 bg-white/5 rounded-2xl border border-white/10 scale-95" />
                      <div className="relative bg-white/15 backdrop-blur-xl border border-white/25 p-3 rounded-2xl text-left shadow-xl">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold text-emerald-400">Monteiro Conecta (Empilhado)</span>
                          <span className="text-[9px] bg-monte-terracota text-white px-1.5 py-0.2 rounded-full font-bold">
                            {simulatedCount} não lidas
                          </span>
                        </div>
                        <p className="text-xs font-bold text-white">Mariana Santos</p>
                        <p className="text-[10px] text-white/70 truncate mt-0.5">
                          Olá! Gostaria de confirmar se meu pedido já foi enviado?
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="animate-in fade-in duration-300 bg-black/60 backdrop-blur-2xl border border-white/20 px-3 py-2 rounded-full flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[10px]">
                          M
                        </div>
                        <p className="text-[11px] font-semibold text-white truncate">
                          Mariana Santos • <span className="text-emerald-300 font-bold">{simulatedCount} não lidas</span>
                        </p>
                      </div>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    </div>
                  )}
                </div>
              </div>

              {/* Home Indicator */}
              <div className="w-24 h-1 bg-white/40 rounded-full mx-auto mb-1 z-20" />
            </div>

            {/* Test count adjuster */}
            <div className="flex items-center justify-between text-xs text-white/70 pt-2 border-t border-white/10">
              <span>Ajustar mensagens não lidas no teste:</span>
              <div className="flex items-center gap-2">
                {[1, 3, 5, 12].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setSimulatedCount(cnt)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      simulatedCount === cnt
                        ? 'bg-monte-verde text-white'
                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
