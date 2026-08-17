import { useState, useEffect, useCallback, useRef } from 'react';
import { whatsappApi, conversationApi } from '../lib/api';
import { getSocket } from '../lib/socket';
import { MessageSquare, Send, Paperclip, ChevronLeft, Search, Image as ImageIcon, Check, CheckCheck } from 'lucide-react';

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

interface Msg {
  id: string;
  type: string;
  content: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  isFromMe: boolean;
  isRead: boolean;
  createdAt: string;
  fromPhone: string | null;
}

export default function ConversationsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConvItem | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const loadAccounts = useCallback(async () => {
    try {
      const data = await whatsappApi.list();
      const connected = data.filter((a: any) => a.status === 'CONNECTED');
      setAccounts(connected);
      if (connected.length > 0 && !selectedAccountId) {
        setSelectedAccountId(connected[0].id);
      }
    } catch {}
  }, [selectedAccountId]);

  const loadConversations = useCallback(async () => {
    if (!selectedAccountId) return;
    try {
      const data = await conversationApi.list(selectedAccountId, search);
      setConversations(data.conversations || []);
    } catch {}
    finally { setLoading(false); }
  }, [selectedAccountId, search]);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const data = await conversationApi.messages(convId);
      setMessages(data.messages || []);
      await conversationApi.markRead(convId);
      scrollToBottom();
    } catch {}
  }, []);

  useEffect(() => { loadAccounts(); }, []);
  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => {
    if (selectedAccountId) {
      setSelectedConv(null);
      setMessages([]);
    }
  }, [selectedAccountId]);

  // Join socket rooms
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !selectedAccountId) return;
    socket.emit('join-account', selectedAccountId);
    return () => { socket.emit('leave-account', selectedAccountId); };
  }, [selectedAccountId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !selectedConv) return;
    socket.emit('join-conversation', selectedConv.id);
    return () => {
      if (selectedConv) socket.emit('leave-conversation', selectedConv.id);
    };
  }, [selectedConv]);

  // Real-time messages
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNewMsg = (data: any) => {
      setConversations(prev => prev.map(c =>
        c.id === data.conversationId
          ? { ...c, lastMessage: data.message.content || `[${data.message.mediaType || 'mídia'}]`, lastMessageAt: data.message.createdAt, unreadCount: c.id === selectedConv?.id ? 0 : (c.unreadCount || 0) + 1 }
          : c
      ));

      if (data.conversationId === selectedConv?.id) {
        setMessages(prev => [...prev, {
          id: data.message.id,
          type: data.message.type,
          content: data.message.content,
          mediaUrl: data.message.mediaUrl,
          mediaType: data.message.mediaType,
          isFromMe: false,
          isRead: false,
          createdAt: data.message.createdAt,
          fromPhone: data.contact?.phone,
        }]);
        conversationApi.markRead(data.conversationId).catch(() => {});
        scrollToBottom();
      }
    };

    const onSent = (data: any) => {
      setConversations(prev => prev.map(c =>
        c.id === data.conversationId
          ? { ...c, lastMessage: data.message.content || `[${data.message.mediaType || data.message.type}]`, lastMessageAt: data.message.createdAt }
          : c
      ));

      if (data.conversationId === selectedConv?.id) {
        setMessages(prev => [...prev, {
          id: data.message.id || `sent-${Date.now()}`,
          type: data.message.type,
          content: data.message.content,
          mediaUrl: data.message.mediaUrl,
          mediaType: data.message.mediaType,
          isFromMe: true,
          isRead: false,
          createdAt: data.message.createdAt,
          fromPhone: null,
        }]);
        scrollToBottom();
      }
    };

    socket.on('message:new', onNewMsg);
    socket.on('message:sent', onSent);
    return () => {
      socket.off('message:new', onNewMsg);
      socket.off('message:sent', onSent);
    };
  }, [selectedAccountId, selectedConv]);

  const handleSelectConv = (conv: ConvItem) => {
    setSelectedConv(conv);
    loadMessages(conv.id);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedAccountId || !selectedConv) return;
    const text = newMessage.trim();
    setSending(true);
    setNewMessage('');
    try {
      await conversationApi.send(selectedAccountId, selectedConv.contactPhone, text);
    } catch (err: any) {
      setNewMessage(text);
      alert('Erro ao enviar: ' + (err.message || 'tente novamente'));
    }
    finally { setSending(false); }
  };

  const handleSendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAccountId || !selectedConv) return;
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
    } catch (err: any) {
      alert('Erro ao enviar arquivo: ' + (err.message || 'tente novamente'));
    }
    finally {
      setSending(false);
      e.target.value = '';
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-4 lg:-m-6 rounded-3xl overflow-hidden shadow-lg border border-monte-sereno/15">
      {/* Sidebar - conversations list */}
      <div className="w-80 bg-white/80 backdrop-blur-md flex flex-col flex-shrink-0 border-r border-monte-sereno/15">
        {accounts.length > 1 && (
          <div className="p-3 border-b border-monte-sereno/15">
            <select className="input-rect text-sm" value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}>
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name} ({a.phone || '—'})</option>
              ))}
            </select>
          </div>
        )}

        <div className="p-3 border-b border-monte-sereno/15">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno" />
            <input type="text" className="input-rect pl-9 text-sm" placeholder="Buscar conversa..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
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
                <div className="w-11 h-11 bg-gradient-to-br from-monte-verde to-monte-azul rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0 shadow-sm">
                  {(conv.contactName || conv.contactPhone || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-monte-azul truncate">{conv.contactName || conv.contactPhone}</p>
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
              Nenhuma conversa
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
              <button onClick={() => { setSelectedConv(null); setMessages([]); }} className="lg:hidden text-monte-azul hover:text-monte-verde">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-11 h-11 bg-gradient-to-br from-monte-verde to-monte-azul rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {(selectedConv.contactName || selectedConv.contactPhone || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-monte-azul font-display">{selectedConv.contactName || selectedConv.contactPhone}</p>
                <p className="text-xs text-monte-sereno">{selectedConv.contactPhone}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((msg, i) => (
                <div key={msg.id || i} className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-3xl px-4 py-2.5 shadow-sm ${
                    msg.isFromMe
                      ? 'bg-monte-verde text-white rounded-br-lg'
                      : 'bg-white/80 backdrop-blur-sm border border-monte-sereno/15 text-monte-azul rounded-bl-lg'
                  }`}>
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
                      <span className={`text-[10px] ${msg.isFromMe ? 'text-white/50' : 'text-monte-sereno'}`}>{formatTime(msg.createdAt)}</span>
                      {msg.isFromMe && (
                        msg.isRead
                          ? <CheckCheck className="w-3.5 h-3.5 text-white/60" />
                          : <Check className="w-3.5 h-3.5 text-white/60" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
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
                <label className="text-monte-sereno hover:text-monte-verde p-2 rounded-full cursor-pointer transition-colors" title="Enviar imagem">
                  <ImageIcon className="w-5 h-5" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleSendFile} disabled={sending} />
                </label>
                <label className="text-monte-sereno hover:text-monte-verde p-2 rounded-full cursor-pointer transition-colors" title="Enviar arquivo">
                  <Paperclip className="w-5 h-5" />
                  <input type="file" className="hidden" onChange={handleSendFile} disabled={sending} />
                </label>
                <textarea
                  className="input-rect flex-1 resize-none min-h-[40px]"
                  rows={1}
                  placeholder="Digite uma mensagem..."
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  autoFocus
                />
                <button onClick={handleSend} disabled={!newMessage.trim() || sending} className="btn-primary p-2.5 rounded-full disabled:opacity-50 transition-opacity">
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
  );
}
