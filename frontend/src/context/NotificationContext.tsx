import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { playNotificationTone, vibrateDevice, initAudioContext, NotificationTonePreset } from '../lib/sound';

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
  triggerNotification: (contactName: string, unreadCount: number, messagePreview: string, conversationId?: string, accountId?: string) => void;
  dismissBanner: () => void;
  activeMobileBanner: MobileNotificationPayload | null;
  testNotificationSound: (overridePreset?: NotificationTonePreset) => void;
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

  // Persistir configurações no localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  // Inicializa contexto de áudio na primeira interação da página
  useEffect(() => {
    const handleGesture = () => {
      initAudioContext();
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
    };
    window.addEventListener('click', handleGesture);
    window.addEventListener('touchstart', handleGesture);
    return () => {
      window.removeEventListener('click', handleGesture);
      window.removeEventListener('touchstart', handleGesture);
    };
  }, []);

  const updateSetting = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const setMuted = (muted: boolean) => updateSetting('muted', muted);
  const setSoundPreset = (soundPreset: NotificationTonePreset) => updateSetting('soundPreset', soundPreset);
  const setVolume = (volume: number) => updateSetting('volume', volume);
  const setIosDisplayMode = (iosDisplayMode: IosDisplayMode) => updateSetting('iosDisplayMode', iosDisplayMode);
  const setVibration = (vibration: boolean) => updateSetting('vibration', vibration);
  const setBrowserPushEnabled = (browserPushEnabled: boolean) => updateSetting('browserPushEnabled', browserPushEnabled);

  const requestBrowserPushPermission = async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    try {
      const result = await Notification.requestPermission();
      const isGranted = result === 'granted';
      setBrowserPushEnabled(isGranted);
      return isGranted;
    } catch {
      return false;
    }
  };

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

      // 3. Exibe banner flutuante no mobile
      const notifId = Date.now().toString();
      setActiveMobileBanner({
        id: notifId,
        contactName: contactName || 'Novo Contato',
        unreadCount: Math.max(1, unreadCount),
        messagePreview: messagePreview || 'Nova mensagem recebida',
        conversationId,
        accountId,
      });

      // Auto-dismiss banner após 5 segundos
      setTimeout(() => {
        setActiveMobileBanner(curr => (curr?.id === notifId ? null : curr));
      }, 5500);

      // 4. Notificação push nativa do navegador
      if (settings.browserPushEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const unreadText = unreadCount > 1 ? `${unreadCount} mensagens não lidas` : '1 mensagem não lida';
          new Notification(contactName || 'Monteiro Conecta', {
            body: `${unreadText}: ${messagePreview || 'Nova mensagem'}`,
            icon: '/logo.png',
            tag: conversationId || 'wa-msg',
          });
        } catch {}
      }
    },
    [settings]
  );

  const dismissBanner = useCallback(() => {
    setActiveMobileBanner(null);
  }, []);

  // Ouve mensagens novas em tempo real do WebSocket
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
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export function useNotification() {
  return useContext(NotificationContext);
}
