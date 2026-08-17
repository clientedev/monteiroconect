import { useState, useEffect, useCallback } from 'react';
import { whatsappApi, conversationApi } from '../lib/api';
import { getSocket } from '../lib/socket';
import { MessageSquare, Send, Paperclip, Smile, ChevronLeft, Search, Image, Mic } from 'lucide-react';

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

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNewMsg = (data: any) => {
      if (data.accountId !== selectedAccountId) return;
      if (data.conversationId === selectedConv?.id) {
        setMessages(prev => [...prev, data.message]);
        conversationApi.markRead(data.conversationId);
      }
      setConversations(prev => prev.map(c =>
        c.id === data.conversationId
          ? { ...c, lastMessage: data.message.content, lastMessageAt: data.message.createdAt, unreadCount: c.id === selectedConv?.id ? 0 : (c.unreadCount || 0) + 1 }
          : c
      ));
    };
    const onSent = (data: any) => {
      if (data.conversationId === selectedConv?.id) {
        setMessages(prev => [...prev, data.message]);
      }
    };
    socket.on('message:new', onNewMsg);
    socket.on('message:sent', onSent);
    return () => { socket.off('message:new', onNewMsg); socket.off('message:sent', onSent); };
  }, [selectedAccountId, selectedConv]);

  const handleSelectConv = (conv: ConvItem) => {
    setSelectedConv(conv);
    loadMessages(conv.id);
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedAccountId || !selectedConv) return;
    setSending(true);
    try {
      await conversationApi.send(selectedAccountId, selectedConv.contactPhone, newMessage);
      setNewMessage('');
    } catch (err: any) { alert(err.message); }
    finally { setSending(false); }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-4 lg:-m-6">
      {/* Conversations list */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
        {/* Account selector */}
        {accounts.length > 1 && (
          <div className="p-3 border-b border-gray-100">
            <select
              className="input text-sm"
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
            >
              {accounts.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name} ({a.phone || '—'})</option>
              ))}
            </select>
          </div>
        )}

        {/* Search */}
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              className="input pl-9 text-sm"
              placeholder="Buscar conversa..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => handleSelectConv(conv)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selectedConv?.id === conv.id ? 'bg-brand-50 border-l-2 border-l-brand-600' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-600 flex-shrink-0">
                  {(conv.contactName || conv.contactPhone || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">{conv.contactName || conv.contactPhone}</p>
                    {conv.lastMessageAt && (
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatTime(conv.lastMessageAt)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500 truncate">{conv.lastMessage || 'Sem mensagens'}</p>
                    {conv.unreadCount > 0 && (
                      <span className="bg-brand-600 text-white text-xs rounded-full min-w-[20px] h-5 flex items-center justify-center flex-shrink-0 ml-2 px-1">{conv.unreadCount}</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
          {!loading && conversations.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Nenhuma conversa
            </div>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedConv ? (
          <>
            {/* Chat header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
              <button onClick={() => { setSelectedConv(null); setMessages([]); }} className="lg:hidden text-gray-500 hover:text-gray-700">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-600">
                {(selectedConv.contactName || selectedConv.contactPhone || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-gray-900">{selectedConv.contactName || selectedConv.contactPhone}</p>
                <p className="text-xs text-gray-500">{selectedConv.contactPhone}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={msg.id || i} className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                    msg.isFromMe
                      ? 'bg-brand-600 text-white rounded-br-md'
                      : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
                  }`}>
                    {msg.mediaType && msg.mediaType !== 'text' && (
                      <div className="text-xs opacity-70 mb-1">
                        📎 {msg.mediaType}
                      </div>
                    )}
                    {msg.content && (
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    )}
                    <p className={`text-xs mt-1 ${msg.isFromMe ? 'text-brand-100' : 'text-gray-400'}`}>
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Nenhuma mensagem ainda. Envie a primeira!
                </div>
              )}
            </div>

            {/* Input */}
            <div className="bg-white border-t border-gray-200 p-3">
              <div className="flex items-end gap-2">
                <button className="text-gray-400 hover:text-gray-600 p-2" title="Anexo">
                  <Paperclip className="w-5 h-5" />
                </button>
                <button className="text-gray-400 hover:text-gray-600 p-2" title="Imagem">
                  <Image className="w-5 h-5" />
                </button>
                <textarea
                  className="input flex-1 resize-none"
                  rows={1}
                  placeholder="Digite uma mensagem..."
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
                <button className="text-gray-400 hover:text-gray-600 p-2" title="Emoji">
                  <Smile className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending}
                  className="btn-primary p-2 rounded-lg"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Selecione uma conversa</p>
              <p className="text-sm mt-1">Escolha uma conversa na lista para começar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
