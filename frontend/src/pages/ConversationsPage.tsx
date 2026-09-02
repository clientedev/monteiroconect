import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { whatsappApi, conversationApi } from '../lib/api';
import { useSocket } from '../context/SocketContext';
import { MessageSquare, Send, Paperclip, ChevronLeft, Search, Image as ImageIcon, Check, CheckCheck, WifiOff, RefreshCw, ChevronUp } from 'lucide-react';

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

export default function ConversationsPage() {
  const { socket } = useSocket();
  const location = useLocation();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConvItem | null>(null);
  const [messages, setMessages] = useState<Map<string, Msg>>(new Map());
  const [newMessage, setNewMessage] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [msgPage, setMsgPage] = useState(1);
  const [msgTotal, setMsgTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesTopRef = useRef<HTMLDivElement>(null);
  const pendingConvId = useRef<string | null>(null);
  const selectedConvRef = useRef<ConvItem | null>(null);
  const selectedAccountIdRef = useRef<string>('');
  const messageRequestId = useRef(0);

  // Sincroniza refs para closure segura nos handlers de WebSocket
  useEffect(() => { selectedConvRef.current = selectedConv; }, [selectedConv]);
  useEffect(() => { selectedAccountIdRef.current = selectedAccountId; }, [selectedAccountId]);

  /** Converte o Map de mensagens em array ordenado cronologicamente */
  const sortedMessages = (): Msg[] => {
    return Array.from(messages.values()).sort((a, b) => msgTime(a) - msgTime(b));
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
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
      if (sorted.length > 0 && !selectedAccountIdRef.current) {
        setSelectedAccountId(sorted[0].id);
      }
    } catch {}
  }, []);

  const loadConversations = useCallback(async (accountId?: string) => {
    const accId = accountId || selectedAccountIdRef.current || selectedAccountId;
    if (!accId) return;
    try {
      const data = await conversationApi.list(accId, search);
      setConversations(data.conversations || []);
    } catch (err) {
      console.error('Erro ao carregar conversas:', err);
    }
    finally { setLoading(false); }
  }, [search, selectedAccountId]);

  /** Carrega as mensagens de uma conversa. page=1 substitui tudo; page>1 prepend. */
  const loadMessages = useCallback(async (convId: string, page = 1) => {
    const requestId = ++messageRequestId.current;
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
        scrollToBottom('instant');
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

  useEffect(() => {
    if (selectedAccountId) {
      setSelectedConv(null);
      setMessages(new Map());
      setMsgPage(1);
      setMsgTotal(0);
      loadConversations(selectedAccountId);
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
    if (!socket || !selectedAccountId) return;
    const joinAcc = () => socket.emit('join-account', selectedAccountId);
    joinAcc();
    socket.on('connect', joinAcc);
    return () => {
      socket.off('connect', joinAcc);
      socket.emit('leave-account', selectedAccountId);
    };
  }, [socket, selectedAccountId]);

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
      const currentAccountId = selectedAccountIdRef.current;
      const currentConv = selectedConvRef.current;

      if (data.accountId !== currentAccountId) return;

      // Atualização cirúrgica da conversa na lista
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === data.conversationId);
        if (idx === -1) {
          loadConversations();
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
      const currentAccountId = selectedAccountIdRef.current;
      const currentConv = selectedConvRef.current;

      if (data.accountId !== currentAccountId) return;

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
          });
          return map;
        });
        setMsgTotal(t => t + 1);
        scrollToBottom();
      }
    };

    const onContactsUpdated = (data: any) => {
      if (data.accountId === selectedAccountIdRef.current) loadConversations();
    };
    const onHistory = (data: any) => {
      if (data.accountId === selectedAccountIdRef.current) {
        loadConversations();
        if (selectedConvRef.current) {
          loadMessages(selectedConvRef.current.id, 1);
        }
      }
    };
    const onSyncProgress = (data: SyncProgress & { accountId: string }) => {
      if (data.accountId !== selectedAccountIdRef.current) return;
      setSyncProgress(data);
      setSyncing(data.status === 'syncing');
      if (data.status === 'completed') {
        loadConversations();
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
  }, [socket, loadConversations, loadMessages]);

  const handleSync = async () => {
    if (!selectedAccountId || syncing) return;
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
      await loadConversations();
    }
  };

  const handleSelectConv = (conv: ConvItem) => {
    setSelectedConv(conv);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
    setMessages(new Map());
    setMsgPage(1);
    setMsgTotal(0);
    loadMessages(conv.id, 1);
  };

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const isConnected = selectedAccount?.status === 'CONNECTED';

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedAccountId || !selectedConv || !isConnected) return;
    const text = newMessage.trim();
    setSending(true);
    setNewMessage('');
    try {
      await conversationApi.send(selectedAccountId, selectedConv.contactPhone, text);
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
    if (!file || !selectedAccountId || !selectedConv || !isConnected) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const token = localStorage.getItem('wa_token');
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload falhou');
      const { url } = await res.json();

      const mime = file.type.toLowerCase();
      let type = 'document';
      if (mime.startsWith('image/')) type = 'image';
      else if (mime.startsWith('video/')) type = 'video';
      else if (mime.startsWith('audio/')) type = 'audio';

      await conversationApi.send(selectedAccountId, selectedConv.contactPhone, '', type, url);
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
            disabled={syncing || !selectedAccountId}
            title="Sincronizar conversas e contatos agora"
            className="p-2.5 rounded-full text-monte-sereno hover:text-monte-verde hover:bg-monte-verde/10 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
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
                    <p className="text-xs text-monte-sereno truncate">{conv.lastMessage || 'Sem mensagens'}</p>
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
            <div className="bg-white/80 backdrop-blur-md border-b border-monte-sereno/15 px-4 py-3 flex items-center gap-3">
              <button onClick={() => { setSelectedConv(null); setMessages(new Map()); }} className="lg:hidden text-monte-azul hover:text-monte-verde">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <Avatar contactId={selectedConv.contactId} name={selectedConv.contactName} phone={selectedConv.contactPhone} />
              <div>
                <p className="font-semibold text-monte-azul font-display">{selectedConv.contactName || formatContactPhone(selectedConv.contactPhone)}</p>
                <p className="text-xs text-monte-sereno">
                  {selectedConv.contactPhone.includes('@g.us')
                    ? '👥 Grupo'
                    : selectedConv.contactPhone.includes('@lid')
                      ? 'WhatsApp'
                      : selectedConv.contactPhone}
                </p>
              </div>
            </div>

            {!isConnected && (
              <div className="bg-amber-100/80 border-b border-amber-200/50 px-4 py-2 flex items-center gap-2 text-amber-800 text-xs">
                <WifiOff className="w-4 h-4 flex-shrink-0" />
                Este WhatsApp está desconectado — reconecte na aba Whatsapps para enviar mensagens. O histórico continua visível.
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
                    {/* Remetente (mensagens de grupo) */}
                    {!msg.isFromMe && msg.senderName && (
                      <p className="text-xs font-bold text-monte-terracota mb-1 truncate">{msg.senderName}</p>
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
              <div className="flex items-end gap-2">
                <label className={`p-2 rounded-full cursor-pointer transition-colors ${isConnected ? 'text-monte-sereno hover:text-monte-verde' : 'text-monte-sereno/30 cursor-not-allowed'}`} title="Enviar imagem">
                  <ImageIcon className="w-5 h-5" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleSendFile} disabled={sending || !isConnected} />
                </label>
                <label className={`p-2 rounded-full cursor-pointer transition-colors ${isConnected ? 'text-monte-sereno hover:text-monte-verde' : 'text-monte-sereno/30 cursor-not-allowed'}`} title="Enviar arquivo">
                  <Paperclip className="w-5 h-5" />
                  <input type="file" className="hidden" onChange={handleSendFile} disabled={sending || !isConnected} />
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
