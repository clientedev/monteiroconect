import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, authApi, tagApi, whatsappApi, conversationApi } from '../lib/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { MessageSquare, Send, Paperclip, ChevronLeft, Search, Image as ImageIcon, Check, CheckCheck, WifiOff, RefreshCw, ChevronUp, Eye, EyeOff, Tag as TagIcon, X, UserCheck } from 'lucide-react';

interface ConvItem {
  id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  contactAvatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  tags: any[];
  accountId: string;
  accountName?: string;
  accountPhone?: string | null;
  assignedUser?: { id: string; username: string; role: string } | null;
  aiEnabled?: boolean;
}

interface ConversationTag {
  id: string;
  name: string;
  color: string;
}

interface Attendant {
  id: string;
  username: string;
  isActive: boolean;
}

interface SyncProgress {
  status: 'syncing' | 'completed' | 'error';
  percent: number;
  remainingPercent: number;
  processedMessages: number;
  totalMessages: number;
  phase: 'history' | 'contacts' | 'groups' | 'summaries';
  message: string;
}

interface Msg {
  id: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  isFromMe: boolean;
  isRead: boolean;
  createdAt: string;
  timestamp?: string | null;
  fromPhone: string | null;
  quotedMessageId?: string | null;
  quotedContent?: string | null;
  senderName?: string | null;
}

/** Esconde identificadores técnicos (LID/JID de grupo) da exibição */
function formatContactPhone(phone: string): string {
  if (phone.includes('@g.us')) return 'Grupo';
  if (phone.includes('@lid')) return 'Contato';
  return phone;
}

/** Foto de perfil do contato direto do WhatsApp, com fallback para inicial */
function Avatar({ contactId, name, phone, size = 'w-11 h-11', textClass = 'text-sm' }: {
  contactId: string;
  name: string | null;
  phone: string;
  size?: string;
  textClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = (name || phone || '?')[0]?.toUpperCase() || '?';

  if (!failed && contactId) {
    return (
      <img
        src={`/api/contacts/${contactId}/avatar`}
        alt=""
        onError={() => setFailed(true)}
        className={`${size} rounded-full object-cover flex-shrink-0 shadow-sm bg-monte-sereno/20`}
      />
    );
  }
  return (
    <div className={`${size} rounded-full bg-gradient-to-br from-monte-verde to-monte-azul text-white flex items-center justify-center ${textClass} font-bold flex-shrink-0 shadow-sm`}>
      {label}
    </div>
  );
}

/** Retorna o timestamp mais relevante de uma mensagem para ordenação */
function msgTime(msg: Msg): number {
  const raw = msg.timestamp || msg.createdAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

const formatTime = (date?: string | null) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const ALL_ACCOUNTS = '__all__';

export default function ConversationsPage() {
  const { socket } = useSocket();
  const { user } = useAuth();
  const location = useLocation();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConvItem | null>(null);
  const [messages, setMessages] = useState<Map<string, Msg>>(new Map());
  const [newMessage, setNewMessage] = useState('');
  const [search, setSearch] = useState('');
  const [includeGroups, setIncludeGroups] = useState(true);
  const [availableTags, setAvailableTags] = useState<ConversationTag[]>([]);
  const [attendants, setAttendants] = useState<Attendant[]>([]);
  const [selectedAttendantName, setSelectedAttendantName] = useState('');
  const [tagBusy, setTagBusy] = useState(false);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [msgPage, setMsgPage] = useState(1);
  const [msgTotal, setMsgTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pendingConvId = useRef<string | null>(null);
  const selectedConvRef = useRef<ConvItem | null>(null);
  const selectedAccountIdRef = useRef<string>('');
  const messageRequestId = useRef(0);
  const conversationsRefreshTimer = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);

  const visibleAccountIds = selectedAccountId === ALL_ACCOUNTS
    ? accounts.map(account => account.id)
    : selectedAccountId
      ? [selectedAccountId]
      : [];

  const isAccountVisible = useCallback((accountId: string) => {
    return selectedAccountIdRef.current === ALL_ACCOUNTS
      ? accounts.some(account => account.id === accountId)
      : accountId === selectedAccountIdRef.current;
  }, [accounts]);

  // Sincroniza refs para closure segura nos handlers de WebSocket
  useEffect(() => { selectedConvRef.current = selectedConv; }, [selectedConv]);
  useEffect(() => { selectedAccountIdRef.current = selectedAccountId; }, [selectedAccountId]);
  useEffect(() => {
    if (!selectedAttendantName && user?.username) {
      setSelectedAttendantName(user.username);
    }
  }, [selectedAttendantName, user?.username]);

  useEffect(() => {
    let active = true;
    Promise.all([tagApi.list(), authApi.listUsers()])
      .then(([tags, users]) => {
        if (!active) return;
        setAvailableTags(tags || []);
        setAttendants((users || []).filter((attendant: Attendant) => attendant.isActive));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  /** Converte o Map de mensagens em array ordenado cronologicamente */
  const sortedMessages = (): Msg[] => {
    return Array.from(messages.values()).sort((a, b) => msgTime(a) - msgTime(b));
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth', force = false) => {
    if (!force && !stickToBottomRef.current) return;
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }, 100);
  };

  const loadAccounts = useCallback(async () => {
    try {
      const data = await whatsappApi.list();
      const sorted = [...data].sort((a: any, b: any) =>
        (b.status === 'CONNECTED' ? 1 : 0) - (a.status === 'CONNECTED' ? 1 : 0)
      );
      setAccounts(sorted);
      const currentSelection = selectedAccountIdRef.current;
      if (sorted.length === 0) {
        setSelectedAccountId('');
      } else if (
        !currentSelection ||
        (currentSelection !== ALL_ACCOUNTS && !sorted.some(account => account.id === currentSelection))
      ) {
        setSelectedAccountId(sorted[0].id);
      }
    } catch {}
  }, []);

  const loadConversations = useCallback(async (accountId?: string) => {
    const accId = accountId || selectedAccountIdRef.current || selectedAccountId;
    if (!accId) return;

    const accountsToLoad = accId === ALL_ACCOUNTS
      ? accounts
      : accounts.filter(account => account.id === accId);
    if (accountsToLoad.length === 0) return;

    try {
      const results = await Promise.all(
        accountsToLoad.map(async account => {
          const data = await conversationApi.list(account.id, search, 1, includeGroups);
          return (data.conversations || []).map((conversation: ConvItem) => ({
            ...conversation,
            accountId: account.id,
            accountName: account.name,
            accountPhone: account.phone,
          }));
        }),
      );
      const merged = results
        .flat()
        .sort((a, b) => {
          const timeDifference = new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
          return timeDifference || b.id.localeCompare(a.id);
        });
      setConversations(merged);
    } catch (err) {
      console.error('Erro ao carregar conversas:', err);
    }
    finally { setLoading(false); }
  }, [accounts, search, selectedAccountId, includeGroups]);

  const scheduleConversationsRefresh = useCallback((delay = 350) => {
    if (conversationsRefreshTimer.current !== null) {
      window.clearTimeout(conversationsRefreshTimer.current);
    }
    conversationsRefreshTimer.current = window.setTimeout(() => {
      conversationsRefreshTimer.current = null;
      loadConversations();
    }, delay);
  }, [loadConversations]);

  /** Carrega as mensagens de uma conversa. page=1 substitui tudo; page>1 prepend. */
  const loadMessages = useCallback(async (convId: string, page = 1, preserveView = false) => {
    const requestId = ++messageRequestId.current;
    const container = messagesContainerRef.current;
    const previousScrollTop = container?.scrollTop || 0;
    const preserveScroll = page === 1 && preserveView && !!container;
    try {
      const data = await conversationApi.messages(convId, page);
      if (requestId !== messageRequestId.current) return;
      const fetched: Msg[] = data.messages || [];
      setMsgTotal(data.total || 0);
      setMsgPage(page);

      setMessages(prev => {
        if (page === 1) {
          const map = new Map<string, Msg>();
          for (const m of fetched) map.set(m.id, m);
          return map;
        } else {
          const map = new Map<string, Msg>(prev);
          for (const m of fetched) {
            if (!map.has(m.id)) map.set(m.id, m);
          }
          return map;
        }
      });

      if (page === 1) {
        // O histórico já está na tela; não faça o usuário esperar a escrita dos
        // badges/read-state para poder enxergá-lo.
        if (preserveScroll) {
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = previousScrollTop;
            }
          });
        } else {
          scrollToBottom('instant', true);
        }
        conversationApi.markRead(convId).then(() => {
          if (socket) socket.emit('conversation-read', convId);
        }).catch(() => {});
      }
    } catch {}
  }, [socket]);

  const loadMoreMessages = async () => {
    if (!selectedConv || loadingMore) return;
    const nextPage = msgPage + 1;
    const hasMore = messages.size < msgTotal;
    if (!hasMore) return;

    setLoadingMore(true);
    const container = messagesTopRef.current?.parentElement;
    const prevScrollHeight = container?.scrollHeight || 0;

    await loadMessages(selectedConv.id, nextPage);
    setLoadingMore(false);

    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = container.scrollHeight - prevScrollHeight;
      }
    });
  };

  useEffect(() => { loadAccounts(); }, []);
  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => () => {
    if (conversationsRefreshTimer.current !== null) {
      window.clearTimeout(conversationsRefreshTimer.current);
    }
  }, []);

  useEffect(() => {
    if (selectedAccountId && selectedAccountId !== ALL_ACCOUNTS) {
      setSelectedConv(null);
      setMessages(new Map());
      setMsgPage(1);
      setMsgTotal(0);
      whatsappApi.syncProgress(selectedAccountId)
        .then(progress => {
          if (progress) {
            setSyncProgress(progress);
            setSyncing(progress.status === 'syncing');
          } else {
            setSyncProgress(null);
            setSyncing(false);
          }
        })
        .catch(() => {});
    } else if (selectedAccountId === ALL_ACCOUNTS) {
      setSelectedConv(null);
      setMessages(new Map());
      setMsgPage(1);
      setMsgTotal(0);
      setSyncProgress(null);
      setSyncing(false);
    }
  }, [selectedAccountId]);

  // Pré-seleção vinda do sino de notificações (location.state)
  useEffect(() => {
    const st: any = location.state;
    if (st?.accountId && st.accountId !== selectedAccountId) {
      setSelectedAccountId(st.accountId);
    }
    if (st?.conversationId) {
      pendingConvId.current = st.conversationId;
    }
  }, [location.state]);

  // Quando a lista carrega, abre a conversa pendente
  useEffect(() => {
    if (pendingConvId.current && conversations.length) {
      const conv = conversations.find(c => c.id === pendingConvId.current);
      pendingConvId.current = null;
      if (conv) handleSelectConv(conv);
    }
  }, [conversations]);

  // Enter socket rooms & auto-rejoin
  useEffect(() => {
    if (!socket || visibleAccountIds.length === 0) return;
    const joinAcc = () => visibleAccountIds.forEach(accountId => socket.emit('join-account', accountId));
    joinAcc();
    socket.on('connect', joinAcc);
    return () => {
      socket.off('connect', joinAcc);
      visibleAccountIds.forEach(accountId => socket.emit('leave-account', accountId));
    };
  }, [socket, visibleAccountIds.join(',')]);

  useEffect(() => {
    if (!socket || !selectedConv) return;
    const joinConv = () => socket.emit('join-conversation', selectedConv.id);
    joinConv();
    socket.on('connect', joinConv);
    return () => {
      socket.off('connect', joinConv);
      socket.emit('leave-conversation', selectedConv.id);
    };
  }, [socket, selectedConv]);

  // Real-time message & status listeners
  useEffect(() => {
    if (!socket) return;

    const onNewMsg = (data: any) => {
      const currentConv = selectedConvRef.current;

      if (!isAccountVisible(data.accountId)) return;

      // Atualização cirúrgica da conversa na lista
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === data.conversationId);
        if (idx === -1) {
          scheduleConversationsRefresh();
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessage: data.conversation?.lastMessage ?? data.message.content,
          lastMessageAt: data.conversation?.lastMessageAt ?? data.message.createdAt,
          unreadCount: currentConv?.id === data.conversationId
            ? 0
            : (updated[idx].unreadCount || 0) + 1,
        };
        updated.sort((a, b) =>
          new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
        );
        return updated;
      });

      if (currentConv?.id === data.conversationId) {
        setMessages(prev => {
          if (prev.has(data.message.id)) return prev;
          const map = new Map(prev);
          map.set(data.message.id, {
            id: data.message.id,
            type: data.message.type,
            content: data.message.content,
            mediaUrl: data.message.mediaUrl,
            mediaType: data.message.mediaType,
            isFromMe: false,
            isRead: false,
            createdAt: data.message.createdAt,
            timestamp: data.message.timestamp,
            fromPhone: data.contact?.phone,
            quotedMessageId: data.message.quotedMessageId,
            quotedContent: data.message.quotedContent,
            senderName: data.message.senderName,
          });
          return map;
        });
        setMsgTotal(t => t + 1);
        conversationApi.markRead(data.conversationId).then(() => {
          socket.emit('conversation-read', data.conversationId);
        }).catch(() => {});
         scrollToBottom();
      }
    };

    const onSent = (data: any) => {
      const currentConv = selectedConvRef.current;

      if (!isAccountVisible(data.accountId)) return;

      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === data.conversationId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessage: data.message.content || updated[idx].lastMessage,
          lastMessageAt: data.message.createdAt || data.message.timestamp,
        };
        updated.sort((a, b) =>
          new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
        );
        return updated;
      });

      if (currentConv?.id === data.conversationId) {
        setMessages(prev => {
          if (prev.has(data.message.id)) return prev;
          const map = new Map(prev);
          map.set(data.message.id, {
            id: data.message.id || `sent-${Date.now()}`,
            type: data.message.type,
            content: data.message.content,
            mediaUrl: data.message.mediaUrl,
            mediaType: data.message.mediaType,
            isFromMe: true,
            isRead: true,
            createdAt: data.message.createdAt,
            timestamp: data.message.timestamp,
            fromPhone: null,
            quotedMessageId: data.message.quotedMessageId,
            quotedContent: data.message.quotedContent,
            senderName: data.message.senderName || user?.username || null,
          });
          return map;
        });
        setMsgTotal(t => t + 1);
         scrollToBottom('smooth', true);
      }
    };

    const onContactsUpdated = (data: any) => {
       if (isAccountVisible(data.accountId)) scheduleConversationsRefresh();
    };
    const onHistory = (data: any) => {
      if (isAccountVisible(data.accountId)) {
         // Atualiza o histórico ao final da sincronização sem mover a posição
         // atual de leitura.
         scheduleConversationsRefresh(500);
         if (selectedConvRef.current) {
           loadMessages(selectedConvRef.current.id, 1, true);
         }
      }
    };
    const onSyncProgress = (data: SyncProgress & { accountId: string }) => {
      if (!isAccountVisible(data.accountId)) return;
      setSyncProgress(data);
      setSyncing(data.status === 'syncing');
      if (data.status === 'completed') {
         scheduleConversationsRefresh(500);
        window.setTimeout(() => setSyncProgress(current => current?.status === 'completed' ? null : current), 7000);
      }
    };
    const onConvRead = (data: { conversationId: string }) => {
      setConversations(prev =>
        prev.map(c => c.id === data.conversationId ? { ...c, unreadCount: 0 } : c)
      );
    };

    socket.on('message:new', onNewMsg);
    socket.on('message:sent', onSent);
    socket.on('contacts:updated', onContactsUpdated);
    socket.on('history:imported', onHistory);
    socket.on('sync:progress', onSyncProgress);
    socket.on('conversation:read', onConvRead);
    return () => {
      socket.off('message:new', onNewMsg);
      socket.off('message:sent', onSent);
      socket.off('contacts:updated', onContactsUpdated);
      socket.off('history:imported', onHistory);
      socket.off('sync:progress', onSyncProgress);
      socket.off('conversation:read', onConvRead);
    };
  }, [socket, isAccountVisible, loadConversations, loadMessages, scheduleConversationsRefresh, user]);

  const handleSync = async () => {
    if (!selectedAccountId || selectedAccountId === ALL_ACCOUNTS || syncing) return;
    setSyncing(true);
    setSyncProgress({
      status: 'syncing',
      percent: 0,
      remainingPercent: 100,
      processedMessages: 0,
      totalMessages: 0,
      phase: 'contacts',
      message: 'Preparando sincronização...',
    });
    try {
      await whatsappApi.sync(selectedAccountId);
      await loadConversations();
    } catch {
      setSyncing(false);
      setSyncProgress(current => current ? { ...current, status: 'error', message: 'Não foi possível sincronizar agora' } : null);
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectConv = (conv: ConvItem) => {
    stickToBottomRef.current = true;
    setSelectedConv(conv);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
    setMessages(new Map());
    setMsgPage(1);
    setMsgTotal(0);
    loadMessages(conv.id, 1);
  };

  const updateConversationTags = (conversationId: string, nextTags: ConversationTag[]) => {
    setConversations(prev => prev.map(conv =>
      conv.id === conversationId ? { ...conv, tags: nextTags } : conv
    ));
    setSelectedConv(prev =>
      prev?.id === conversationId ? { ...prev, tags: nextTags } : prev
    );
  };

  const handleAddTag = async (tagId: string) => {
    if (!selectedConv || !tagId || tagBusy) return;
    const tag = availableTags.find(item => item.id === tagId);
    if (!tag || selectedConv.tags?.some(item => item.id === tag.id)) return;
    setTagBusy(true);
    try {
      await tagApi.add(selectedConv.id, selectedConv.contactId, tag.id);
      updateConversationTags(selectedConv.id, [...(selectedConv.tags || []), tag]);
    } catch (err: any) {
      alert(err.message || 'Não foi possível adicionar a etiqueta');
    } finally {
      setTagBusy(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!selectedConv || tagBusy) return;
    setTagBusy(true);
    try {
      await tagApi.remove(selectedConv.id, selectedConv.contactId, tagId);
      updateConversationTags(
        selectedConv.id,
        (selectedConv.tags || []).filter(tag => tag.id !== tagId),
      );
    } catch (err: any) {
      alert(err.message || 'Não foi possível remover a etiqueta');
    } finally {
      setTagBusy(false);
    }
  };

  const handleAssignConversation = async (userId: string) => {
    if (!selectedConv || assignmentBusy) return;
    setAssignmentBusy(true);
    try {
      const result = await conversationApi.assign(selectedConv.id, userId || null);
      const assignedUser = result.assignedUser || null;
      setSelectedConv(prev => prev?.id === selectedConv.id ? { ...prev, assignedUser } : prev);
      setConversations(prev => prev.map(conv =>
        conv.id === selectedConv.id ? { ...conv, assignedUser } : conv
      ));
    } catch (err: any) {
      alert(err.message || 'Não foi possível encaminhar a conversa');
    } finally {
      setAssignmentBusy(false);
    }
  };

  const handleToggleAi = async () => {
    if (!selectedConv || aiBusy) return;
    const enabled = selectedConv.aiEnabled === false;
    setAiBusy(true);
    try {
      const result = await conversationApi.setAiEnabled(selectedConv.id, enabled);
      setSelectedConv(prev => prev?.id === selectedConv.id ? { ...prev, aiEnabled: result.aiEnabled } : prev);
      setConversations(prev => prev.map(conv =>
        conv.id === selectedConv.id ? { ...conv, aiEnabled: result.aiEnabled } : conv
      ));
    } catch (err: any) {
      alert(err.message || 'Não foi possível alterar o atendimento da IA');
    } finally {
      setAiBusy(false);
    }
  };

  const selectedAccount = accounts.find(a =>
    a.id === (selectedConv?.accountId || (selectedAccountId === ALL_ACCOUNTS ? '' : selectedAccountId))
  );
  const isConnected = selectedAccount?.status === 'CONNECTED';

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedConv || !selectedConv.accountId || !isConnected) return;
    const text = newMessage.trim();
    setSending(true);
    setNewMessage('');
    try {
      await conversationApi.send(
        selectedConv.accountId,
        selectedConv.contactPhone,
        text,
        'text',
        undefined,
        undefined,
        undefined,
        selectedAttendantName || user?.username,
      );
      if (selectedConvRef.current) {
        await loadMessages(selectedConvRef.current.id, 1);
      }
    } catch (err: any) {
      setNewMessage(text);
      alert('Erro ao enviar: ' + (err.message || 'tente novamente'));
    }
    finally { setSending(false); }
  };

  const handleSendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv || !selectedConv.accountId || !isConnected) return;
    setSending(true);
    try {
       const uploaded = await api.upload<{
         url: string;
         originalName: string;
         mimetype: string;
       }>('/upload', file);

      const mime = file.type.toLowerCase();
      let type = 'document';
      if (mime.startsWith('image/')) type = 'image';
      else if (mime.startsWith('video/')) type = 'video';
      else if (mime.startsWith('audio/')) type = 'audio';

       const caption = type === 'document' ? file.name : newMessage.trim();
       await conversationApi.send(
        selectedConv.accountId,
        selectedConv.contactPhone,
        caption,
        type,
        uploaded.url,
        uploaded.mimetype,
        uploaded.originalName,
        selectedAttendantName || user?.username,
       );
       setNewMessage('');
      await loadMessages(selectedConv.id, 1);
    } catch (err: any) {
      alert('Erro ao enviar arquivo: ' + (err.message || 'tente novamente'));
    }
    finally {
      setSending(false);
      e.target.value = '';
    }
  };

  const renderContent = (text: string | null) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (/^https?:\/\//.test(part)) {
        return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100 break-all">{part}</a>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const msgs = sortedMessages();
  const hasMoreHistory = messages.size < msgTotal;

  return (
    <div className="space-y-3">
      {syncProgress && (
        <div
          className={`rounded-2xl border px-4 py-3 shadow-sm ${
            syncProgress.status === 'error'
              ? 'bg-red-50 border-red-200'
              : syncProgress.status === 'completed'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-white/85 border-monte-sereno/15'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-monte-azul truncate">
                {syncProgress.status === 'completed' ? 'Sincronização concluída' : syncProgress.status === 'error' ? 'Sincronização interrompida' : 'Sincronizando tudo...'}
              </p>
              <p className="text-xs text-monte-sereno truncate">{syncProgress.message}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold text-monte-verde">{Math.round(syncProgress.percent)}%</p>
              <p className="text-[10px] text-monte-sereno">{Math.round(syncProgress.remainingPercent)}% restante</p>
            </div>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-monte-sereno/15"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(syncProgress.percent)}
            aria-label="Progresso da sincronização"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                syncProgress.status === 'error' ? 'bg-red-400' : 'bg-gradient-to-r from-monte-verde to-emerald-400'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, syncProgress.percent))}%` }}
            />
          </div>
          {syncProgress.totalMessages > 0 && (
            <p className="text-[11px] text-monte-sereno mt-1.5">
              {syncProgress.processedMessages.toLocaleString('pt-BR')} de {syncProgress.totalMessages.toLocaleString('pt-BR')} mensagens processadas
            </p>
          )}
        </div>
      )}
      <div className="flex h-[calc(100vh-8rem)] -m-4 lg:-m-6 rounded-3xl overflow-hidden shadow-lg border border-monte-sereno/15">
      {/* Sidebar - conversations list */}
      <div className="w-80 bg-white/80 backdrop-blur-md flex flex-col flex-shrink-0 border-r border-monte-sereno/15">
        {accounts.length > 1 && (
          <div className="p-3 border-b border-monte-sereno/15">
            <select className="input-rect text-sm" value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}>
              <option value={ALL_ACCOUNTS}>Todos os WhatsApps</option>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.phone || '—'}){a.status !== 'CONNECTED' ? ` — ${a.status === 'QR_CODE' ? 'aguardando QR' : a.status === 'ERROR' ? 'erro' : 'desconectado'}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

         <div className="p-3 border-b border-monte-sereno/15 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno" />
            <input type="text" className="input-rect pl-10 text-sm" placeholder="Buscar conversa..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button
            onClick={handleSync}
            disabled={syncing || !selectedAccountId || selectedAccountId === ALL_ACCOUNTS}
            title={selectedAccountId === ALL_ACCOUNTS ? 'Selecione um WhatsApp para sincronizar' : 'Sincronizar conversas e contatos agora'}
            className="p-2.5 rounded-full text-monte-sereno hover:text-monte-verde hover:bg-monte-verde/10 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
           <button
             type="button"
             onClick={() => setIncludeGroups(current => !current)}
             title={includeGroups ? 'Ocultar grupos' : 'Mostrar grupos'}
             aria-label={includeGroups ? 'Ocultar grupos' : 'Mostrar grupos'}
             className={`p-2.5 rounded-full transition-colors flex-shrink-0 ${
               includeGroups
                 ? 'text-monte-sereno hover:text-monte-terracota hover:bg-monte-terracota/10'
                 : 'text-monte-verde bg-monte-verde/10'
             }`}
           >
             {includeGroups ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
               <span className="hidden sm:inline text-[11px] font-semibold">
                 {includeGroups ? 'Grupos' : 'Sem grupos'}
               </span>
           </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => handleSelectConv(conv)}
              className={`w-full text-left px-4 py-3 border-b border-monte-sereno/10 hover:bg-monte-areiaSecao/60 transition-colors ${
                selectedConv?.id === conv.id
                  ? 'bg-monte-verde/8 border-l-[3px] border-l-monte-verde'
                  : 'border-l-[3px] border-l-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <Avatar contactId={conv.contactId} name={conv.contactName} phone={conv.contactPhone} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-monte-azul truncate">{conv.contactName || formatContactPhone(conv.contactPhone)}</p>
                    {conv.lastMessageAt && (
                      <span className="text-[10px] text-monte-sereno flex-shrink-0 ml-2">{formatTime(conv.lastMessageAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <div className="min-w-0">
                      <p className="text-xs text-monte-sereno truncate">{conv.lastMessage || 'Sem mensagens'}</p>
                      {selectedAccountId === ALL_ACCOUNTS && conv.accountName && (
                        <p className="text-[10px] text-monte-verde/80 font-medium truncate mt-0.5">
                          {conv.accountName}{conv.accountPhone ? ` · ${conv.accountPhone}` : ''}
                        </p>
                      )}
                      {!!conv.tags?.length && (
                        <div className="flex items-center gap-1 mt-1 overflow-hidden">
                          {conv.tags.slice(0, 3).map((tag: ConversationTag) => (
                            <span
                              key={tag.id}
                              className="inline-flex items-center gap-1 max-w-[92px] rounded-full border px-1.5 py-0.5 text-[9px] font-semibold truncate"
                              style={{ color: tag.color, borderColor: tag.color, backgroundColor: `${tag.color}12` }}
                            >
                              <TagIcon className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{tag.name}</span>
                            </span>
                          ))}
                          {conv.tags.length > 3 && (
                            <span className="text-[9px] text-monte-sereno flex-shrink-0">+{conv.tags.length - 3}</span>
                          )}
                        </div>
                      )}
                      {conv.assignedUser && (
                        <p className="flex items-center gap-1 text-[10px] text-monte-azul/70 truncate mt-1">
                          <UserCheck className="w-2.5 h-2.5 flex-shrink-0" />
                          {conv.assignedUser.username}
                        </p>
                      )}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="bg-monte-terracota text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center flex-shrink-0 ml-2 px-1 font-bold shadow-sm">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {!loading && conversations.length === 0 && (
            <div className="p-8 text-center text-monte-sereno text-sm">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              {accounts.length === 0 ? (
                <>
                  <p>Nenhum WhatsApp conectado</p>
                  <Link to="/whatsapp" className="inline-block mt-3 text-monte-verde font-semibold hover:underline">
                    Conectar um WhatsApp
                  </Link>
                </>
              ) : (
                'Nenhuma conversa sincronizada'
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-monte-areia">
        {selectedConv ? (
          <>
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md border-b border-monte-sereno/15 px-4 py-3 flex items-start gap-3">
              <button onClick={() => { setSelectedConv(null); setMessages(new Map()); }} className="lg:hidden text-monte-azul hover:text-monte-verde">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <Avatar contactId={selectedConv.contactId} name={selectedConv.contactName} phone={selectedConv.contactPhone} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-monte-azul font-display">{selectedConv.contactName || formatContactPhone(selectedConv.contactPhone)}</p>
                <p className="text-xs text-monte-sereno">
                  {selectedConv.contactPhone.includes('@g.us')
                    ? '👥 Grupo'
                    : selectedConv.contactPhone.includes('@lid')
                      ? 'WhatsApp'
                      : selectedConv.contactPhone}
                </p>
                {selectedAccountId === ALL_ACCOUNTS && selectedConv.accountName && (
                  <p className="text-[11px] text-monte-verde font-medium">
                    {selectedConv.accountName}{selectedConv.accountPhone ? ` · ${selectedConv.accountPhone}` : ''}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {(selectedConv.tags || []).map((tag: ConversationTag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold"
                      style={{ color: tag.color, borderColor: tag.color, backgroundColor: `${tag.color}12` }}
                    >
                      <TagIcon className="w-3 h-3" />
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag.id)}
                        disabled={tagBusy}
                        aria-label={`Remover etiqueta ${tag.name}`}
                        className="rounded-full hover:bg-black/10 disabled:opacity-50"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {availableTags.some(tag => !(selectedConv.tags || []).some(current => current.id === tag.id)) && (
                    <select
                      className="input-rect py-1 px-2 text-[10px] w-auto max-w-[170px]"
                      value=""
                      onChange={e => handleAddTag(e.target.value)}
                      disabled={tagBusy}
                      aria-label="Adicionar etiqueta"
                    >
                      <option value="">+ Etiqueta</option>
                      {availableTags
                        .filter(tag => !(selectedConv.tags || []).some(current => current.id === tag.id))
                        .map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                    </select>
                  )}
                  {!availableTags.length && (
                    <Link to="/tags" className="inline-flex items-center gap-1 text-[10px] text-monte-verde hover:underline">
                      <TagIcon className="w-3 h-3" /> Criar etiqueta
                    </Link>
                  )}
                </div>
                {attendants.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <UserCheck className="w-3.5 h-3.5 text-monte-sereno flex-shrink-0" />
                    <label htmlFor="conversation-assignee" className="text-[10px] font-semibold text-monte-sereno flex-shrink-0">
                      Encaminhar para
                    </label>
                    <select
                      id="conversation-assignee"
                      className="input-rect py-1 px-2 text-[10px] min-w-0 max-w-[190px]"
                      value={selectedConv.assignedUser?.id || ''}
                      onChange={e => handleAssignConversation(e.target.value)}
                      disabled={assignmentBusy}
                    >
                      <option value="">Sem responsável</option>
                      {attendants.map(attendant => (
                        <option key={attendant.id} value={attendant.id}>{attendant.username}</option>
                      ))}
                    </select>
                    {assignmentBusy && <span className="text-[10px] text-monte-sereno">Salvando...</span>}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold ${
                    selectedConv.aiEnabled === false
                      ? 'bg-monte-terracota/10 text-monte-terracota'
                      : 'bg-monte-verde/10 text-monte-verde'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${selectedConv.aiEnabled === false ? 'bg-monte-terracota' : 'bg-monte-verde'}`} />
                    {selectedConv.aiEnabled === false ? 'Atendimento humano' : 'IA ativa'}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleAi}
                    disabled={aiBusy}
                    className={`text-[10px] font-semibold rounded-full px-2.5 py-1 border transition-colors disabled:opacity-50 ${
                      selectedConv.aiEnabled === false
                        ? 'border-monte-verde/30 text-monte-verde hover:bg-monte-verde/10'
                        : 'border-monte-terracota/30 text-monte-terracota hover:bg-monte-terracota/10'
                    }`}
                  >
                    {aiBusy ? 'Salvando...' : selectedConv.aiEnabled === false ? 'Reativar IA' : 'Desligar IA e assumir'}
                  </button>
                </div>
              </div>
            </div>

            {!isConnected && (
              <div className="bg-amber-100/80 border-b border-amber-200/50 px-4 py-2 flex items-center gap-2 text-amber-800 text-xs">
                <WifiOff className="w-4 h-4 flex-shrink-0" />
                Este WhatsApp está desconectado — reconecte na aba Whatsapps para enviar mensagens. O histórico continua visível.
              </div>
            )}

            {/* Messages */}
             <div
               ref={messagesContainerRef}
               className="flex-1 overflow-y-auto p-4 space-y-2"
               onScroll={() => {
                 const container = messagesContainerRef.current;
                 if (!container) return;
                 stickToBottomRef.current =
                   container.scrollHeight - container.scrollTop - container.clientHeight < 96;
               }}
             >
              {/* FIX 6.2: Botão "carregar mais" no topo */}
              <div ref={messagesTopRef} />
              {hasMoreHistory && (
                <div className="flex justify-center mb-2">
                  <button
                    onClick={loadMoreMessages}
                    disabled={loadingMore}
                    className="flex items-center gap-1.5 text-xs text-monte-sereno hover:text-monte-azul bg-white/70 border border-monte-sereno/20 rounded-full px-4 py-1.5 transition-colors disabled:opacity-50"
                  >
                    {loadingMore
                      ? <div className="w-3.5 h-3.5 border-2 border-monte-sereno border-t-transparent rounded-full animate-spin" />
                      : <ChevronUp className="w-3.5 h-3.5" />}
                    {loadingMore ? 'Carregando...' : `Ver mensagens anteriores (${msgTotal - messages.size} restantes)`}
                  </button>
                </div>
              )}

              {msgs.map((msg) => (
                <div key={msg.id} className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-3xl px-4 py-2.5 shadow-sm ${
                    msg.isFromMe
                      ? 'bg-monte-verde text-white rounded-br-lg'
                      : 'bg-white/80 backdrop-blur-sm border border-monte-sereno/15 text-monte-azul rounded-bl-lg'
                  }`}>
                    {/* Remetente: atendente logado nas mensagens do painel ou contato em grupos */}
                    {msg.senderName && (
                      <p className={`text-xs font-bold mb-1 truncate ${msg.isFromMe ? 'text-white/80' : 'text-monte-terracota'}`}>
                        {msg.senderName}
                      </p>
                    )}
                    {/* Mensagem respondida (reply) */}
                    {msg.quotedContent && (
                      <div className={`mb-1.5 pl-2.5 border-l-[3px] rounded-md py-1 pr-2 ${
                        msg.isFromMe
                          ? 'border-white/70 bg-white/15 text-white/85'
                          : 'border-monte-terracota bg-monte-terracota/8 text-monte-azul/80'
                      }`}>
                        <p className="text-xs line-clamp-3 break-words whitespace-pre-wrap">{msg.quotedContent}</p>
                      </div>
                    )}
                    {msg.mediaType === 'image' && msg.mediaUrl && (
                      <div className="mb-2 -mx-1 -mt-1 rounded-t-3xl overflow-hidden">
                        <img src={msg.mediaUrl} alt="Imagem" className="w-full object-cover cursor-pointer" loading="lazy" onClick={() => window.open(msg.mediaUrl!, '_blank')} />
                      </div>
                    )}
                    {msg.mediaType === 'video' && msg.mediaUrl && (
                      <div className="mb-2">
                        <video src={msg.mediaUrl} controls className="rounded-2xl max-w-full max-h-80" />
                      </div>
                    )}
                     {msg.mediaType === 'audio' && msg.mediaUrl && (
                      <div className="mb-2">
                        <audio src={msg.mediaUrl} controls className="max-w-full" />
                      </div>
                    )}
                     {msg.mediaType === 'audio' && !msg.mediaUrl && (
                       <p className="text-xs opacity-70 mb-1">Áudio sem arquivo disponível</p>
                     )}
                    {msg.content && (
                      <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{renderContent(msg.content)}</p>
                    )}
                    {msg.mediaType === 'document' && msg.mediaUrl && (
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4 opacity-70" />
                        <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline break-all">{msg.content || 'Documento'}</a>
                      </div>
                    )}
                    {(msg.mediaType === 'location' || msg.mediaType === 'sticker' || msg.mediaType === 'contact') && (
                      <p className="text-xs opacity-70 mb-1">
                        {msg.mediaType === 'location' ? '📍 Localização' : msg.mediaType === 'sticker' ? '🎭 Figurinha' : '👤 Contato'}
                      </p>
                    )}

                    <div className={`flex items-center gap-1 mt-1 ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
                      <span className={`text-[10px] ${msg.isFromMe ? 'text-white/50' : 'text-monte-sereno'}`}>
                        {formatTime(msg.timestamp || msg.createdAt)}
                      </span>
                      {msg.isFromMe && (
                        msg.isRead
                          ? <CheckCheck className="w-3.5 h-3.5 text-white/60" />
                          : <Check className="w-3.5 h-3.5 text-white/60" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {msgs.length === 0 && (
                <div className="flex items-center justify-center h-full text-monte-sereno">
                  <div className="text-center">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Nenhuma mensagem ainda</p>
                    <p className="text-xs mt-1 opacity-60">Envie a primeira!</p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="bg-white/80 backdrop-blur-md border-t border-monte-sereno/15 p-3">
              {attendants.length > 0 && (
                <div className="flex items-center justify-end gap-2 mb-2">
                  <label htmlFor="attendant-select" className="text-[11px] font-semibold text-monte-sereno">
                    Enviar como
                  </label>
                  <select
                    id="attendant-select"
                    className="input-rect py-1.5 px-2 text-xs w-auto max-w-[190px]"
                    value={selectedAttendantName}
                    onChange={e => setSelectedAttendantName(e.target.value)}
                    disabled={sending}
                  >
                    {attendants.map(attendant => (
                      <option key={attendant.id} value={attendant.username}>{attendant.username}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-end gap-2">
                <label className={`p-2 rounded-full cursor-pointer transition-colors ${isConnected ? 'text-monte-sereno hover:text-monte-verde' : 'text-monte-sereno/30 cursor-not-allowed'}`} title="Enviar imagem">
                  <ImageIcon className="w-5 h-5" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleSendFile} disabled={sending || !isConnected} />
                </label>
                 <label className={`p-2 rounded-full cursor-pointer transition-colors ${isConnected ? 'text-monte-sereno hover:text-monte-verde' : 'text-monte-sereno/30 cursor-not-allowed'}`} title="Enviar imagem, documento ou áudio">
                  <Paperclip className="w-5 h-5" />
                   <input type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" className="hidden" onChange={handleSendFile} disabled={sending || !isConnected} />
                </label>
                <textarea
                  className="input-rect flex-1 resize-none min-h-[40px]"
                  rows={1}
                  placeholder={isConnected ? 'Digite uma mensagem...' : 'WhatsApp desconectado...'}
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  disabled={!isConnected}
                  autoFocus
                />
                <button onClick={handleSend} disabled={!newMessage.trim() || sending || !isConnected} className="btn-primary p-2.5 rounded-full disabled:opacity-50 transition-opacity">
                  {sending
                    ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Send className="w-5 h-5" />
                  }
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-monte-sereno">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-3 opacity-20" />
              <p className="text-lg font-display font-semibold">Selecione uma conversa</p>
              <p className="text-sm mt-1 opacity-60">Escolha uma conversa na lista para começar</p>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
