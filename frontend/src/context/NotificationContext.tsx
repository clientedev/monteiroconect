import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { playNotificationTone, vibrateDevice, initAudioContext, NotificationTonePreset } from '../lib/sound';
import { pushApi } from '../lib/api';

export type { NotificationTonePreset };
export type IosDisplayMode = 'banner' | 'stack' | 'count';

export interface MobileNotificationPayload {
  id: string;
  contactName: string;
  unreadCount: number;
  messagePreview: string;
  conversationId?: string;
  accountId?: string;
}

export interface NotificationSchedule {
  enabled: boolean;
  startTime: string;   // e.g. "08:00"
  endTime: string;     // e.g. "18:00"
  daysOfWeek: number[]; // [1, 2, 3, 4, 5] (Seg a Sex por padrão)
}

interface NotificationSettings {
  muted: boolean;
  soundPreset: NotificationTonePreset;
  volume: number;
  iosDisplayMode: IosDisplayMode;
  vibration: boolean;
  browserPushEnabled: boolean;
  schedule: NotificationSchedule;
}

interface NotificationContextType extends NotificationSettings {
  setMuted: (muted: boolean) => void;
  setSoundPreset: (preset: NotificationTonePreset) => void;
  setVolume: (volume: number) => void;
  setIosDisplayMode: (mode: IosDisplayMode) => void;
  setVibration: (vibration: boolean) => void;
  setBrowserPushEnabled: (enabled: boolean) => void;
  setScheduleEnabled: (enabled: boolean) => void;
  setScheduleTimes: (startTime: string, endTime: string) => void;
  setScheduleDays: (daysOfWeek: number[]) => void;
  isCurrentlyWithinSchedule: boolean;
  requestBrowserPushPermission: () => Promise<boolean>;
  triggerNotification: (
    contactName: string,
    unreadCount: number,
    messagePreview: string,
    conversationId?: string,
    accountId?: string
  ) => void;
  dismissBanner: () => void;
  activeMobileBanner: MobileNotificationPayload | null;
  testNotificationSound: (overridePreset?: NotificationTonePreset) => void;
  pushSupported: boolean;
  pushSubscribed: boolean;
  pushLoading: boolean;
  subscribeToPush: (force?: boolean) => Promise<boolean>;
  sendTestPush: () => Promise<void>;
}

const STORAGE_KEY = 'mc_notification_settings_v1';

export const defaultSchedule: NotificationSchedule = {
  enabled: false,
  startTime: '08:00',
  endTime: '18:00',
  daysOfWeek: [1, 2, 3, 4, 5],
};

const defaultSettings: NotificationSettings = {
  muted: false,
  soundPreset: 'suave',
  volume: 0.8,
  iosDisplayMode: 'banner',
  vibration: true,
  browserPushEnabled: false,
  schedule: defaultSchedule,
};

export function checkIsWithinSchedule(schedule?: NotificationSchedule): boolean {
  if (!schedule || !schedule.enabled) return true;
  const now = new Date();
  const currentDay = now.getDay();
  if (Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.length > 0 && !schedule.daysOfWeek.includes(currentDay)) {
    return false;
  }
  const [sH, sM] = (schedule.startTime || '08:00').split(':').map(Number);
  const [eH, eM] = (schedule.endTime || '18:00').split(':').map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = (sH || 0) * 60 + (sM || 0);
  const endMinutes = (eH || 0) * 60 + (eM || 0);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const NotificationContext = createContext<NotificationContextType>({
  ...defaultSettings,
  setMuted: () => {},
  setSoundPreset: () => {},
  setVolume: () => {},
  setIosDisplayMode: () => {},
  setVibration: () => {},
  setBrowserPushEnabled: () => {},
  setScheduleEnabled: () => {},
  setScheduleTimes: () => {},
  setScheduleDays: () => {},
  isCurrentlyWithinSchedule: true,
  requestBrowserPushPermission: async () => false,
  triggerNotification: () => {},
  dismissBanner: () => {},
  activeMobileBanner: null,
  testNotificationSound: () => {},
  pushSupported: false,
  pushSubscribed: false,
  pushLoading: false,
  subscribeToPush: async () => false,
  sendTestPush: async () => {},
});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  const [settings, setSettings] = useState<NotificationSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  const [activeMobileBanner, setActiveMobileBanner] = useState<MobileNotificationPayload | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Persistir configurações no localStorage e sincronizar Service Worker
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
      try {
        navigator.serviceWorker.controller.postMessage({
          type: 'UPDATE_SCHEDULE',
          schedule: settings.schedule,
          muted: settings.muted,
        });
      } catch {}
    }
  }, [settings]);

  // Checa suporte nativo a Web Push no navegador / iOS PWA
  useEffect(() => {
    const isSupported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;
    setPushSupported(isSupported);
  }, []);

  const updateSetting = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const setSoundPreset = (soundPreset: NotificationTonePreset) => updateSetting('soundPreset', soundPreset);
  const setVolume = (volume: number) => updateSetting('volume', volume);
  const setIosDisplayMode = (iosDisplayMode: IosDisplayMode) => updateSetting('iosDisplayMode', iosDisplayMode);
  const setVibration = (vibration: boolean) => updateSetting('vibration', vibration);
  const setBrowserPushEnabled = (browserPushEnabled: boolean) => updateSetting('browserPushEnabled', browserPushEnabled);

  const setScheduleEnabled = (enabled: boolean) => {
    setSettings(prev => ({
      ...prev,
      schedule: { ...(prev.schedule || defaultSchedule), enabled },
    }));
  };

  const setScheduleTimes = (startTime: string, endTime: string) => {
    setSettings(prev => ({
      ...prev,
      schedule: { ...(prev.schedule || defaultSchedule), startTime, endTime },
    }));
  };

  const setScheduleDays = (daysOfWeek: number[]) => {
    setSettings(prev => ({
      ...prev,
      schedule: { ...(prev.schedule || defaultSchedule), daysOfWeek },
    }));
  };

  const isCurrentlyWithinSchedule = checkIsWithinSchedule(settings.schedule);

  // Inscreve no Web Push com as chaves VAPID do backend (funciona com app fechado)
  const subscribeToPush = useCallback(async (force = false): Promise<boolean> => {
    if (settings.muted && !force) return false;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return false;
    }

    setPushLoading(true);
    try {
      // 1. Solicita permissão se ainda não concedida
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setPushSubscribed(false);
        setBrowserPushEnabled(false);
        return false;
      }
      setBrowserPushEnabled(true);

      // 2. Registra e aguarda o Service Worker
      let reg: ServiceWorkerRegistration;
      try {
        reg = await navigator.serviceWorker.ready;
      } catch {
        reg = await navigator.serviceWorker.register('/sw.js');
        reg = await navigator.serviceWorker.ready;
      }

      // 3. Busca a chave pública VAPID do backend
      const { publicKey } = await pushApi.getVapidPublicKey();
      if (!publicKey) {
        throw new Error('Chave VAPID não retornada pelo servidor');
      }

      // 4. Cria ou reutiliza a assinatura
      const convertedKey = urlBase64ToUint8Array(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey as unknown as BufferSource,
        });
      }

      // 5. Salva a inscrição no backend associada ao usuário autenticado
      await pushApi.subscribe(sub.toJSON() as any);
      setPushSubscribed(true);
      return true;
    } catch (err) {
      console.error('Erro ao registrar Web Push:', err);
      return false;
    } finally {
      setPushLoading(false);
    }
  }, [settings.muted]);

  const setMuted = useCallback((muted: boolean) => {
    updateSetting('muted', muted);
    if (muted) {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
        navigator.serviceWorker.ready.then(reg => {
          reg.pushManager.getSubscription().then(sub => {
            if (sub) {
              const endpoint = sub.endpoint;
              sub.unsubscribe().catch(() => {});
              pushApi.unsubscribe(endpoint).catch(() => {});
              setPushSubscribed(false);
            }
          });
        }).catch(() => {});
      }
    } else {
      initAudioContext();
      setBrowserPushEnabled(true);
      setTimeout(() => {
        subscribeToPush(true);
      }, 50);
    }
  }, [subscribeToPush]);

  // Inicializa contexto de áudio e solicita permissão de push na primeira interação se for default
  useEffect(() => {
    const handleGesture = () => {
      initAudioContext();
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        subscribeToPush();
      }
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
    };
    window.addEventListener('click', handleGesture);
    window.addEventListener('touchstart', handleGesture);
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
    };
  }, [subscribeToPush]);

  // Sincroniza automaticamente a assinatura do Push quando já houver permissão concedida
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      subscribeToPush();
    }
  }, [subscribeToPush]);



  const requestBrowserPushPermission = async (): Promise<boolean> => {
    return subscribeToPush();
  };

  const sendTestPush = useCallback(async () => {
    try {
      if (!pushSubscribed) {
        const ok = await subscribeToPush();
        if (!ok) {
          alert('Por favor, permita o recebimento de notificações no navegador/iPhone para testar.');
          return;
        }
      }
      await pushApi.test();
    } catch (err: any) {
      alert(err?.message || 'Erro ao disparar push de teste');
    }
  }, [pushSubscribed, subscribeToPush]);

  const testNotificationSound = (overridePreset?: NotificationTonePreset) => {
    initAudioContext();
    const toneToPlay = overridePreset || settings.soundPreset;
    playNotificationTone(toneToPlay, settings.volume);
    if (settings.vibration) {
      vibrateDevice([80, 40, 80]);
    }
  };

  const triggerNotification = useCallback(
    (
      contactName: string,
      unreadCount: number,
      messagePreview: string,
      conversationId?: string,
      accountId?: string
    ) => {
      if (settings.muted || !checkIsWithinSchedule(settings.schedule)) return;

      // 1. Toca som suave
      playNotificationTone(settings.soundPreset, settings.volume);

      // 2. Vibra dispositivo se ativado
      if (settings.vibration) {
        vibrateDevice([100, 50, 100]);
      }

      // 3. Exibe banner flutuante no mobile (apenas quando o app está aberto)
      const notifId = Date.now().toString();
      setActiveMobileBanner({
        id: notifId,
        contactName: contactName || 'Novo Contato',
        unreadCount: Math.max(1, unreadCount),
        messagePreview: messagePreview || 'Nova mensagem recebida',
        conversationId,
        accountId,
      });

      // 4. Notificação nativa no navegador se a aba estiver em segundo plano
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'hidden' &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(contactName || 'Novo Contato', {
            body: messagePreview || 'Nova mensagem',
            icon: '/icon-192.png',
            tag: conversationId || 'wa-msg',
          });
        } catch {}
      }

      // Auto-dismiss banner após 5.5 segundos
      setTimeout(() => {
        setActiveMobileBanner(curr => (curr?.id === notifId ? null : curr));
      }, 5500);
    },
    [settings.muted, settings.soundPreset, settings.volume, settings.vibration, settings.schedule]
  );

  const dismissBanner = useCallback(() => {
    setActiveMobileBanner(null);
  }, []);

  // Ouve mensagens novas em tempo real do WebSocket quando o app está aberto
  useEffect(() => {
    if (!socket) return;

    const onNewMsg = (data: any) => {
      if (!data || settings.muted || !checkIsWithinSchedule(settings.schedule)) return;
      const msg = data.message || data;
      const conv = data.conversation || {};
      const contact = data.contact || conv.contact || {};

      // Ignora mensagens enviadas por mim mesmo ou de conversas silenciadas
      if (msg.isFromMe || conv.isMuted || data.isMuted) return;

      const contactName = contact.name || contact.phone || msg.senderName || 'Contato WhatsApp';
      const unreadCount = conv.unreadCount || data.unreadCount || 1;
      const messagePreview = msg.content || (msg.mediaType ? `[${msg.mediaType}]` : 'Nova mensagem');

      triggerNotification(contactName, unreadCount, messagePreview, conv.id || data.conversationId, conv.whatsappId);
    };

    socket.on('message:new', onNewMsg);
    return () => {
      socket.off('message:new', onNewMsg);
    };
  }, [socket, settings.muted, settings.schedule, triggerNotification]);

  return (
    <NotificationContext.Provider
      value={{
        ...settings,
        setMuted,
        setSoundPreset,
        setVolume,
        setIosDisplayMode,
        setVibration,
        setBrowserPushEnabled,
        setScheduleEnabled,
        setScheduleTimes,
        setScheduleDays,
        isCurrentlyWithinSchedule,
        requestBrowserPushPermission,
        triggerNotification,
        dismissBanner,
        activeMobileBanner,
        testNotificationSound,
        pushSupported,
        pushSubscribed,
        pushLoading,
        subscribeToPush,
        sendTestPush,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotification() {
  return useContext(NotificationContext);
}
