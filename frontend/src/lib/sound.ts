// Web Audio API Sound Synthesizer for Clean Notification Tones

export type NotificationTonePreset = 'suave' | 'ios' | 'pop' | 'zen' | 'silent';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// User interaction gesture helper to unlock audio context on mobile/desktop
export function initAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

/**
 * Toca um tom de notificação suave sintetizado via Web Audio API.
 * @param preset Nome do preset ('suave', 'ios', 'pop', 'zen', 'silent')
 * @param volume Volume de 0 a 1
 */
export function playNotificationTone(preset: NotificationTonePreset = 'suave', volume: number = 0.8): void {
  if (preset === 'silent' || volume <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().then(() => playPreset(ctx, preset, volume)).catch(() => {});
  } else {
    playPreset(ctx, preset, volume);
  }
}

function playPreset(ctx: AudioContext, preset: NotificationTonePreset, masterVol: number) {
  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(masterVol, now);

  // Lowpass filter for smooth, clean, non-harsh harmonics
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2600, now);
  filter.Q.setValueAtTime(1, now);

  masterGain.connect(filter);
  filter.connect(ctx.destination);

  switch (preset) {
    case 'suave': {
      // Clean dual chime (Tom suave cristalino)
      // Note 1: A5 (880 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.35, now + 0.012);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Note 2: E6 (1318.5 Hz) - 75ms delay
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.5, now + 0.075);
      gain2.gain.setValueAtTime(0.001, now + 0.075);
      gain2.gain.exponentialRampToValueAtTime(0.4, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now + 0.075);
      osc2.stop(now + 0.48);
      break;
    }

    case 'ios': {
      // iOS Crystal Chime (Estilo iPhone)
      const notes = [523.25, 659.25, 1046.50]; // C5, E5, C6
      notes.forEach((freq, idx) => {
        const start = now + idx * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.3, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(start);
        osc.stop(start + 0.35);
      });
      break;
    }

    case 'pop': {
      // Soft Bubble Pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(350, now);
      osc.frequency.exponentialRampToValueAtTime(850, now + 0.04);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.4, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.14);
      break;
    }

    case 'zen': {
      // Harmônico Zen Relaxante (F#5, C#6, G#6)
      const notes = [739.99, 1108.73, 1661.22];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.04);
        gain.gain.setValueAtTime(0.001, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.25 / (i + 1), now + i * 0.04 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + i * 0.04);
        osc.stop(now + 0.65);
      });
      break;
    }
  }
}

/**
 * Vibra o dispositivo móvel se suportado (navigator.vibrate).
 */
export function vibrateDevice(pattern: number[] = [100, 50, 100]): void {
  if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {}
  }
}
