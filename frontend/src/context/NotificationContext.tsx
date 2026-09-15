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

interface NotificationSettings {
  muted: boolean;
  soundPreset: NotificationTonePreset;
  volume: number;
  iosDisplayMode: IosDisplayMode;
  vibration: boolean;
  browserPushEnabled: boolean;
}

interface NotificationContextType extends NotificationSettings {
  setMuted: (muted: boolean) => void;
  setSoundPreset: (preset: NotificationTonePreset) => void;
  setVolume: (volume: number) => void;
  setIosDisplayMode: (mode: IosDisplayMode) => void;
  setVibration: (vibration: boolean) => void;
  setBrowserPushEnabled: (enabled: boolean) => void;
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
  subscribeToPush: () => Promise<boolean>;
  sendTestPush: () => Promise<void>;
}

const STORAGE_KEY = 'mc_notification_settings_v1';

const defaultSettings: NotificationSettings = {
  muted: false,
  soundPreset: 'suave',
  volume: 0.8,
  iosDisplayMode: 'banner',
  vibration: true,
  browserPushEnabled: false,
};

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

  // Persistir configurações no localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
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

  const updateSetting = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const setMuted = (muted: boolean) => updateSetting('muted', muted);
  const setSoundPreset = (soundPreset: NotificationTonePreset) => updateSetting('soundPreset', soundPreset);
  const setVolume = (volume: number) => updateSetting('volume', volume);
  const setIosDisplayMode = (iosDisplayMode: IosDisplayMode) => updateSetting('iosDisplayMode', iosDisplayMode);
  const setVibration = (vibration: boolean) => updateSetting('vibration', vibration);
  const setBrowserPushEnabled = (browserPushEnabled: boolean) => updateSetting('browserPushEnabled', browserPushEnabled);

  // Inscreve no Web Push com as chaves VAPID do backend (funciona com app fechado)
  const subscribeToPush = useCallback(async (): Promise<boolean> => {
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
  }, []);

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
      if (settings.muted) return;

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

      // Auto-dismiss banner após 5.5 segundos
      setTimeout(() => {
        setActiveMobileBanner(curr => (curr?.id === notifId ? null : curr));
      }, 5500);
    },
    [settings]
  );

  const dismissBanner = useCallback(() => {
    setActiveMobileBanner(null);
  }, []);

  // Ouve mensagens novas em tempo real do WebSocket quando o app está aberto
  useEffect(() => {
    if (!socket) return;

    const onNewMsg = (data: any) => {
      if (!data) return;
      const msg = data.message || data;
      const conv = data.conversation || {};
      const contact = data.contact || conv.contact || {};

      // Ignora mensagens enviadas por mim mesmo
      if (msg.isFromMe) return;

      const contactName = contact.name || contact.phone || msg.senderName || 'Contato WhatsApp';
      const unreadCount = conv.unreadCount || data.unreadCount || 1;
      const messagePreview = msg.content || (msg.mediaType ? `[${msg.mediaType}]` : 'Nova mensagem');

      triggerNotification(contactName, unreadCount, messagePreview, conv.id || data.conversationId, conv.whatsappId);
    };

    socket.on('message:new', onNewMsg);
    return () => {
      socket.off('message:new', onNewMsg);
    };
  }, [socket, triggerNotification]);

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
