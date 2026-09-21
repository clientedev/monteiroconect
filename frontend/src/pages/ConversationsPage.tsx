import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useLocation, useOutletContext, useNavigate } from 'react-router-dom';
import { api, authApi, tagApi, whatsappApi, conversationApi, contactApi, quickMessageApi, type QuickMessage } from '../lib/api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  MessageSquare, Send, Paperclip, ChevronLeft, Search, Image as ImageIcon,
  Check, CheckCheck, WifiOff, RefreshCw, ChevronUp, Eye, EyeOff, Tag as TagIcon,
  X, UserCheck, SlidersHorizontal, Info, Bot, User as UserIcon, ShieldCheck,
  Maximize2, Minimize2, ExternalLink, Reply, Share2, Bell, BellOff, ArrowLeft,
  Zap, MessageSquareQuote, FileText, Download,
} from 'lucide-react';
import CrmContactModal from '../components/CrmContactModal';


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
  isMuted?: boolean;
}

interface ConversationTag {
  id: string;
  name: string;
  color: string;
}

interface ReplyingToState {
  id: string;
  content: string;
  senderName: string;
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
  caption?: string | null;
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

function formatLastMessagePreview(text: string | null | undefined): string {
  if (!text) return 'Sem mensagens';
  const trimmed = text.trim();
  if (trimmed === '[sticker]') return '🎭 Figurinha';
  if (trimmed === '[image]') return '📷 Imagem';
  if (trimmed === '[video]') return '🎥 Vídeo';
  if (trimmed === '[audio]') return '🎵 Áudio';
  if (trimmed === '[document]') return '📄 Documento';
  if (trimmed === '[location]') return '📍 Localização';
  if (trimmed === '[contact]') return '👤 Contato';
  if (trimmed === '[templateMessage]') return '📋 Mensagem interativa';
  if (trimmed === '[secretEncryptedMessage]') return '🔒 Mensagem protegida';
  if (trimmed === '[messageContextInfo]' || trimmed === '[unknown]') return 'Mensagem';
  return trimmed;
}

export function formatMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  if (trimmed.startsWith('/uploads/')) {
    return trimmed;
  }
  if (trimmed.startsWith('uploads/')) {
    return `/${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return `/uploads${trimmed}`;
  }
  return `/uploads/${trimmed}`;
}

function DocumentMessageCard({ msg }: { msg: Msg }) {
  const [downloading, setDownloading] = useState(false);
  const fileName = msg.content || 'Documento.pdf';
  const ext = (fileName.split('.').pop() || 'pdf').toLowerCase();
  const isPdf = ext === 'pdf';

  const normalizedUrl = formatMediaUrl(msg.mediaUrl);

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!normalizedUrl) return;
    setDownloading(true);
    try {
      // 1. Tenta baixar via endpoint dedicado de download autenticado
      const downloadEndpoint = `/api/conversations/media/download?url=${encodeURIComponent(normalizedUrl)}&filename=${encodeURIComponent(fileName)}`;
      const token = localStorage.getItem('wa_token');
      let res = await fetch(downloadEndpoint, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      // 2. Fallback para rota direta de upload
      if (!res.ok) {
        res = await fetch(`${normalizedUrl}?download=1&name=${encodeURIComponent(fileName)}`);
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        alert(errJson?.error || 'Este documento expirou ou não pôde ser recuperado do WhatsApp.');
        return;
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      alert('Não foi possível baixar o arquivo: ' + (err?.message || 'Falha de rede'));
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!normalizedUrl) return;
    try {
      const res = await fetch(normalizedUrl);
      if (res.ok) {
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      } else {
        window.open(normalizedUrl, '_blank');
      }
    } catch {
      window.open(normalizedUrl, '_blank');
    }
  };

  const badgeStyle = useMemo(() => {
    if (ext === 'pdf') {
      return {
        bg: msg.isFromMe ? 'bg-red-400/30 text-white border-red-300/40' : 'bg-red-500/10 text-red-600 border-red-500/20',
        label: 'PDF',
      };
    }
    if (['doc', 'docx'].includes(ext)) {
      return {
        bg: msg.isFromMe ? 'bg-blue-400/30 text-white border-blue-300/40' : 'bg-blue-500/10 text-blue-600 border-blue-500/20',
        label: 'DOC',
      };
    }
    if (['xls', 'xlsx', 'csv'].includes(ext)) {
      return {
        bg: msg.isFromMe ? 'bg-emerald-400/30 text-white border-emerald-300/40' : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        label: 'XLS',
      };
    }
    if (['zip', 'rar', '7z'].includes(ext)) {
      return {
        bg: msg.isFromMe ? 'bg-amber-400/30 text-white border-amber-300/40' : 'bg-amber-500/10 text-amber-600 border-amber-500/20',
        label: 'ZIP',
      };
    }
    return {
      bg: msg.isFromMe ? 'bg-white/20 text-white border-white/30' : 'bg-slate-100 text-slate-600 border-slate-200',
      label: ext.slice(0, 4).toUpperCase(),
    };
  }, [ext, msg.isFromMe]);

  return (
    <div className="my-1 max-w-sm sm:max-w-md">
      <div className={`flex items-center gap-2.5 p-2.5 rounded-2xl border transition-all ${
        msg.isFromMe
          ? 'bg-white/15 border-white/20 text-white'
          : 'bg-slate-50/90 border-slate-200 text-slate-800 shadow-2xs'
      }`}>
        {/* Badge do tipo de arquivo */}
        <div className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center font-bold text-xs flex-shrink-0 border ${badgeStyle.bg}`}>
          <FileText className="w-4 h-4 mb-0.5" />
          <span className="text-[8px] uppercase tracking-wider font-extrabold leading-none">{badgeStyle.label}</span>
        </div>

        {/* Informações do arquivo */}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate leading-tight" title={fileName}>
            {fileName}
          </p>
          <p className={`text-[10px] mt-0.5 ${msg.isFromMe ? 'text-white/70' : 'text-slate-400'}`}>
            Documento {ext.toUpperCase()}
          </p>
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isPdf && msg.mediaUrl && (
            <button
              type="button"
              onClick={handlePreview}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                msg.isFromMe
                  ? 'hover:bg-white/20 text-white'
                  : 'hover:bg-slate-200/80 text-slate-600'
              }`}
              title="Visualizar documento"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
          {msg.mediaUrl ? (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                msg.isFromMe
                  ? 'bg-white text-emerald-800 hover:bg-white/90 active:scale-95'
                  : 'bg-monte-verde text-white hover:bg-monte-verde/90 active:scale-95'
              }`}
              title="Baixar documento"
            >
              {downloading ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{downloading ? 'Baixando...' : 'Baixar'}</span>
            </button>
          ) : (
            <span className={`text-[10px] font-medium px-2 py-1 rounded-md ${
              msg.isFromMe ? 'bg-white/10 text-white/70' : 'bg-slate-100 text-slate-400'
            }`}>
              Indisponível
            </span>
          )}
        </div>
      </div>
      {/* Se houver legenda cadastrada diferente do nome do arquivo, exibe */}
      {msg.caption && msg.caption !== fileName && (
        <p className="text-xs mt-1.5 px-1 leading-relaxed opacity-90">{msg.caption}</p>
      )}
    </div>
  );
}

function ChatMessageItem({
  msg,
  selectedConvName,
  onReply,
  onForward,
  renderContent,
}: {
  msg: Msg;
  selectedConvName: string;
  onReply: (msg: Msg) => void;
  onForward: (msg: Msg) => void;
  renderContent: (content: string) => React.ReactNode;
}) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const diffX = e.touches[0].clientX - touchStartX.current;
    const diffY = e.touches[0].clientY - touchStartY.current;

    if (!isSwiping.current) {
      if (Math.abs(diffX) > 8 && Math.abs(diffX) > Math.abs(diffY)) {
        isSwiping.current = true;
      }
    }

    if (isSwiping.current) {
      let offset = diffX;
      if (!msg.isFromMe) {
        offset = Math.min(Math.max(diffX, -15), 75);
      } else {
        offset = Math.min(Math.max(diffX, -75), 15);
      }
      setSwipeOffset(offset);
      if (Math.abs(offset) > 15) {
        setShowActions(true);
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (Math.abs(swipeOffset) > 40) {
      onReply(msg);
    }
    setSwipeOffset(0);
    setTimeout(() => {
      setShowActions(false);
    }, 2000);
  };

  return (
    <div className={`group relative flex items-center w-full my-1 ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
        className={`relative max-w-[75%] rounded-3xl px-4 py-2.5 shadow-sm touch-pan-y ${
          msg.isFromMe
            ? 'bg-monte-verde text-white rounded-br-lg'
            : 'bg-white/80 backdrop-blur-sm border border-monte-sereno/15 text-monte-azul rounded-bl-lg'
        }`}
      >
        {msg.senderName && (
          <p className={`text-xs font-bold mb-1 truncate ${msg.isFromMe ? 'text-white/80' : 'text-monte-terracota'}`}>
            {msg.senderName}
          </p>
        )}
        {msg.quotedContent && (
          <div className={`mb-1.5 pl-2.5 border-l-[3px] rounded-lg py-1 pr-2 text-xs ${
            msg.isFromMe
              ? 'border-white/80 bg-white/20 text-white'
              : 'border-monte-verde bg-monte-verde/10 text-monte-azul'
          }`}>
            <p className="line-clamp-3 break-words whitespace-pre-wrap text-[11px] opacity-90">
              {msg.quotedContent}
            </p>
          </div>
        )}
        {msg.mediaType === 'image' && msg.mediaUrl && (
          <div className="mb-2 -mx-1 -mt-1 rounded-t-3xl overflow-hidden">
            <img
              src={formatMediaUrl(msg.mediaUrl) || ''}
              alt="Imagem"
              className="w-full max-h-96 object-cover cursor-pointer"
              loading="lazy"
              onClick={() => {
                const u = formatMediaUrl(msg.mediaUrl);
                if (u) window.open(u, '_blank');
              }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        )}
        {(msg.mediaType === 'sticker' || msg.type === 'sticker') && (
          <div className="mb-2 p-1 flex flex-col items-center">
            {msg.mediaUrl ? (
              <img
                src={formatMediaUrl(msg.mediaUrl) || ''}
                alt="Figurinha"
                className="w-32 h-32 md:w-36 md:h-36 object-contain cursor-pointer transition-transform hover:scale-105 active:scale-95"
                loading="lazy"
                onClick={() => {
                  const u = formatMediaUrl(msg.mediaUrl);
                  if (u) window.open(u, '_blank');
                }}
                onError={(e) => {
                  const target = e.target as HTMLElement;
                  target.style.display = 'none';
                  const fallback = target.parentElement?.querySelector('.sticker-fallback');
                  if (fallback) (fallback as HTMLElement).classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`sticker-fallback ${msg.mediaUrl ? 'hidden' : ''}`}>
              <p className="text-xs opacity-70 flex items-center gap-1">🎭 Figurinha</p>
            </div>
          </div>
        )}
        {msg.mediaType === 'video' && msg.mediaUrl && (
          <div className="mb-2">
            <video src={formatMediaUrl(msg.mediaUrl) || ''} controls className="rounded-2xl max-w-full max-h-80" />
          </div>
        )}
        {msg.mediaType === 'audio' && msg.mediaUrl && (
          <div className="mb-2 space-y-1">
            <audio
              src={formatMediaUrl(msg.mediaUrl) || ''}
              controls
              preload="metadata"
              className="max-w-full rounded-lg"
            />
            <div className="text-[10px] opacity-70 text-right">
              <a href={formatMediaUrl(msg.mediaUrl) || ''} target="_blank" rel="noopener noreferrer" className="underline">
                Baixar áudio
              </a>
            </div>
          </div>
        )}
        {msg.mediaType === 'audio' && !msg.mediaUrl && (
          <p className="text-xs opacity-70 mb-1">Áudio sem arquivo disponível</p>
        )}
        {msg.content && msg.mediaType !== 'sticker' && msg.type !== 'sticker' && msg.mediaType !== 'document' && (
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{renderContent(msg.content)}</p>
        )}
        {msg.mediaType === 'document' && (
          <DocumentMessageCard msg={msg} />
        )}
        {(msg.mediaType === 'location' || msg.mediaType === 'contact') && (
          <p className="text-xs opacity-70 mb-1">
            {msg.mediaType === 'location' ? '📍 Localização' : '👤 Contato'}
          </p>
        )}

        <div className={`flex items-center gap-1 mt-1 ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
          <span className={`text-[10px] ${msg.isFromMe ? 'text-white/70' : 'text-monte-sereno'}`}>
            {formatTime(msg.timestamp || msg.createdAt)}
          </span>
          {msg.isFromMe && (
            <span title={msg.isRead ? 'Mensagem lida' : 'Mensagem enviada'}>
              {msg.isRead
                ? <CheckCheck className="w-4 h-4 text-sky-300 drop-shadow-sm stroke-[2.5]" />
                : <CheckCheck className="w-4 h-4 text-white/90 stroke-[2]" />}
            </span>
          )}
        </div>

        {/* Floating action buttons (pílula flutuante sem descolar a mensagem da extremidade) */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-20 bg-white/95 backdrop-blur-md border border-monte-sereno/20 shadow-md rounded-full px-1 py-0.5 transition-all duration-200 ${
            msg.isFromMe ? 'right-full mr-2' : 'left-full ml-2'
          } ${
            showActions
              ? 'opacity-100 scale-100 pointer-events-auto'
              : 'opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto'
          }`}
        >
          {msg.isFromMe ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onForward(msg);
                }}
                className="p-1.5 rounded-full text-monte-sereno hover:text-monte-verde hover:bg-black/5 transition-all"
                title="Encaminhar esta mensagem"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReply(msg);
                }}
                className="p-1.5 rounded-full text-monte-sereno hover:text-monte-verde hover:bg-black/5 transition-all"
                title="Responder esta mensagem"
              >
                <Reply className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReply(msg);
                }}
                className="p-1.5 rounded-full text-monte-sereno hover:text-monte-verde hover:bg-black/5 transition-all"
                title="Responder esta mensagem"
              >
                <Reply className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onForward(msg);
                }}
                className="p-1.5 rounded-full text-monte-sereno hover:text-monte-verde hover:bg-black/5 transition-all"
                title="Encaminhar esta mensagem"
              >
                <Share2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const ALL_ACCOUNTS = '__all__';

export default function ConversationsPage() {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user } = useAuth();
  const location = useLocation();
  const { triggerNotification } = useNotification();
  const { setIsMobileChatOpen, isPopout, isFocusMode, setIsFocusMode, togglePopoutWindow } = (useOutletContext<any>() || {});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConvItem | null>(null);
  const [showContactDetails, setShowContactDetails] = useState(false);
  const [messages, setMessages] = useState<Map<string, Msg>>(new Map());
  const [newMessage, setNewMessage] = useState('');
  const [search, setSearch] = useState('');
  const [includeGroups, setIncludeGroups] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('mc_include_groups');
      if (saved !== null) return saved === 'true';
    } catch {}
    return false; // 'Sem grupos' ativo por padrão (oculta grupos)
  });
  const [availableTags, setAvailableTags] = useState<ConversationTag[]>([]);

  const toggleIncludeGroups = () => {
    setIncludeGroups(prev => {
      const next = !prev;
      try {
        localStorage.setItem('mc_include_groups', String(next));
      } catch {}
      return next;
    });
  };
  const [attendants, setAttendants] = useState<any[]>([]);
  const [selectedAttendantName, setSelectedAttendantName] = useState<string>(() => {
    try {
      return localStorage.getItem('mc_selected_attendant_name') || '';
    } catch {
      return '';
    }
  });

  const handleAttendantChange = (name: string) => {
    setSelectedAttendantName(name);
    try {
      localStorage.setItem('mc_selected_attendant_name', name);
    } catch {}
  };
  const [tagBusy, setTagBusy] = useState(false);
  const [assignmentBusy, setAssignmentBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [muteBusy, setMuteBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [hideSyncProgress, setHideSyncProgress] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mc_hide_sync_progress') === 'true';
    } catch {
      return false;
    }
  });

  const toggleHideSyncProgress = (hide: boolean) => {
    setHideSyncProgress(hide);
    try {
      localStorage.setItem('mc_hide_sync_progress', hide ? 'true' : 'false');
    } catch {}
  };
  const [msgPage, setMsgPage] = useState(1);
  const [msgTotal, setMsgTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedContactForCrm, setSelectedContactForCrm] = useState<any | null>(null);
  const [replyingTo, setReplyingTo] = useState<ReplyingToState | null>(null);
  const [forwardingMsg, setForwardingMsg] = useState<Msg | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [selectedForwardConvIds, setSelectedForwardConvIds] = useState<string[]>([]);
  const [forwardingBusy, setForwardingBusy] = useState(false);

  // Mensagens Rápidas (Quick Messages)
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([]);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [dismissedSlash, setDismissedSlash] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const quickMenuRef = useRef<HTMLDivElement | null>(null);

  const loadQuickMessages = useCallback(async () => {
    try {
      const data = await quickMessageApi.list();
      setQuickMessages(data);
    } catch (err) {
      console.warn('Falha ao carregar mensagens rápidas:', err);
    }
  }, []);

  useEffect(() => {
    loadQuickMessages();
  }, [loadQuickMessages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickMenuRef.current && !quickMenuRef.current.contains(event.target as Node)) {
        setShowQuickMenu(false);
      }
    };
    if (showQuickMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showQuickMenu]);

  // Detecta se o usuário está digitando um atalho iniciado com '/'
  const slashQuery = useMemo(() => {
    if (dismissedSlash) return null;
    const match = /(?:^|\s)\/([a-zA-Z0-9_\u00C0-\u00FF-]*)$/.exec(newMessage);
    if (match === null) return null;
    return match[1].toLowerCase();
  }, [newMessage, dismissedSlash]);

  // Mensagens rápidas correspondentes ao atalho digitado
  const matchingQuickMessages = useMemo(() => {
    if (slashQuery === null) return [];
    if (!slashQuery) return quickMessages.slice(0, 7);
    return quickMessages.filter(m =>
      m.shortcut.toLowerCase().includes(slashQuery) ||
      m.title.toLowerCase().includes(slashQuery)
    ).slice(0, 7);
  }, [slashQuery, quickMessages]);

  // Mensagens rápidas filtradas dentro do catálogo (botão ⚡)
  const filteredQuickMenuMessages = useMemo(() => {
    if (!quickSearch.trim()) return quickMessages;
    const q = quickSearch.toLowerCase().trim().replace(/^\/+/, '');
    return quickMessages.filter(m =>
      m.shortcut.toLowerCase().includes(q) ||
      m.title.toLowerCase().includes(q) ||
      m.content.toLowerCase().includes(q)
    );
  }, [quickMessages, quickSearch]);

  const handleSelectQuickMessage = useCallback((qm: QuickMessage) => {
    if (slashQuery !== null) {
      const regex = new RegExp(`(?:^|\\s)\\/[a-zA-Z0-9_\\u00C0-\\u00FF-]*$`);
      const match = regex.exec(newMessage);
      if (match) {
        const prefix = newMessage.substring(0, match.index + (match[0].startsWith(' ') ? 1 : 0));
        setNewMessage(prefix + qm.content);
      } else {
        setNewMessage(qm.content);
      }
    } else {
      if (!newMessage.trim()) {
        setNewMessage(qm.content);
      } else {
        setNewMessage(prev => prev + '\n' + qm.content);
      }
    }
    setShowQuickMenu(false);
    setSlashIndex(0);
    setDismissedSlash(false);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const len = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(len, len);
      }
    }, 50);
  }, [slashQuery, newMessage]);

  // Sincroniza estado de chat aberto no mobile para o Layout
  useEffect(() => {
    setIsMobileChatOpen?.(!!selectedConv);
  }, [selectedConv, setIsMobileChatOpen]);

  useEffect(() => {
    return () => {
      setIsMobileChatOpen?.(false);
    };
  }, [setIsMobileChatOpen]);

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
    let active = true;
    Promise.all([tagApi.list(), authApi.listUsers()])
      .then(([tags, users]) => {
        if (!active) return;
        setAvailableTags(tags || []);
        setAttendants((users || []).filter((attendant: any) => attendant.isActive && attendant.showInSendAs !== false));
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
      if (!data || !data.message) return;
      const currentConv = selectedConvRef.current;
      const isTargetActiveConv = currentConv?.id === data.conversationId;
      const belongsToVisibleAccount = !data.accountId || isAccountVisible(data.accountId);

      // Se a mensagem não pertence à conta visível e também não é da conversa aberta, ignora
      if (!belongsToVisibleAccount && !isTargetActiveConv) return;

      // Atualização cirúrgica da conversa na lista
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === data.conversationId);
        if (idx === -1) {
          scheduleConversationsRefresh(100);
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessage: data.conversation?.lastMessage ?? data.message.content,
          lastMessageAt: data.conversation?.lastMessageAt ?? data.message.createdAt,
          unreadCount: isTargetActiveConv
            ? 0
            : (updated[idx].unreadCount || 0) + 1,
        };
        updated.sort((a, b) =>
          new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime()
        );
        return updated;
      });

      if (isTargetActiveConv) {
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
      if (!data || !data.message) return;
      const currentConv = selectedConvRef.current;
      const isTargetActiveConv = currentConv?.id === data.conversationId;
      const belongsToVisibleAccount = !data.accountId || isAccountVisible(data.accountId);

      if (!belongsToVisibleAccount && !isTargetActiveConv) return;

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
            senderName: data.message.senderName || null,
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

    const onConvDeleted = (data: { accountId: string; conversationId: string }) => {
      setConversations(prev => prev.filter(c => c.id !== data.conversationId));
      if (selectedConvRef.current?.id === data.conversationId) {
        setSelectedConv(null);
      }
    };

    socket.on('message:new', onNewMsg);
    socket.on('message:sent', onSent);
    socket.on('contacts:updated', onContactsUpdated);
    socket.on('history:imported', onHistory);
    socket.on('sync:progress', onSyncProgress);
    socket.on('conversation:read', onConvRead);
    socket.on('conversation:deleted', onConvDeleted);
    return () => {
      socket.off('message:new', onNewMsg);
      socket.off('message:sent', onSent);
      socket.off('contacts:updated', onContactsUpdated);
      socket.off('history:imported', onHistory);
      socket.off('sync:progress', onSyncProgress);
      socket.off('conversation:read', onConvRead);
      socket.off('conversation:deleted', onConvDeleted);
    };
  }, [socket, isAccountVisible, loadConversations, loadMessages, scheduleConversationsRefresh, user]);

  // Atualização instantânea ao desbloquear celular ou voltar ao PWA
  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        loadConversations();
        if (selectedConvRef.current) {
          loadMessages(selectedConvRef.current.id, 1, true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleResume);

    return () => {
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleResume);
    };
  }, [loadConversations, loadMessages]);

  // Polling leve contínuo de contingência (ativo apenas se a conexão WebSocket cair)
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (!socket?.connected) {
        loadConversations();
        if (selectedConvRef.current && !loadingMore && !sending) {
          loadMessages(selectedConvRef.current.id, 1, true);
        }
      }
    }, 10000);

    return () => window.clearInterval(interval);
  }, [loadConversations, loadMessages, loadingMore, sending, socket?.connected]);

  const handleSync = async () => {
    if (!selectedAccountId || selectedAccountId === ALL_ACCOUNTS || syncing) return;
    toggleHideSyncProgress(false);
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

  const handleBackToConversations = () => {
    if (selectedConv) {
      setSelectedConv(null);
      setIsMobileChatOpen?.(false);
      setMessages(new Map());
      setShowContactDetails(false);
    } else if ((location.state as any)?.from) {
      navigate((location.state as any).from);
    }
  };

  const handleSelectConv = (conv: ConvItem) => {
    stickToBottomRef.current = true;
    setSelectedConv(conv);
    setReplyingTo(null);
    setIsMobileChatOpen?.(true);
    setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c));
    setMessages(new Map());
    setMsgPage(1);
    setMsgTotal(0);
    loadMessages(conv.id, 1);
  };

  // Redireciona e abre a conversa quando chega de um clique em notificação (push nativo ou in-app)
  useEffect(() => {
    const targetConvId =
      (location.state as any)?.conversationId ||
      new URLSearchParams(location.search).get('convId');

    if (!targetConvId) return;
    if (selectedConv?.id === targetConvId) return;

    const found = conversations.find(c => c.id === targetConvId);
    if (found) {
      handleSelectConv(found);
      return;
    }

    // Se ainda não estiver na lista (por exemplo outra conta), busca individualmente
    conversationApi.get(targetConvId).then((res: any) => {
      if (!res) return;
      const item: ConvItem = {
        id: res.id,
        contactId: res.contactId,
        contactName: res.contact?.name || res.contact?.phone || 'Contato',
        contactPhone: res.contact?.phone,
        contactAvatarUrl: res.contact?.avatarUrl,
        lastMessage: res.lastMessage,
        lastMessageAt: res.lastMessageAt,
        unreadCount: 0,
        tags: (res.tags || []).map((t: any) => t.tag || t),
        accountId: res.whatsappId,
        assignedUser: res.assignments?.[0]?.user || null,
        aiEnabled: res.aiEnabled,
        isMuted: res.isMuted,
      };
      if (res.whatsappId && selectedAccountId !== ALL_ACCOUNTS && selectedAccountId !== res.whatsappId) {
        setSelectedAccountId(res.whatsappId);
      }
      handleSelectConv(item);
    }).catch(() => {});
  }, [location.state, location.search, conversations, selectedConv?.id, selectedAccountId]);

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

      // Trigger notification for the attendant about the assignment
      if (assignedUser) {
        const contactName = selectedConv.contactName || selectedConv.contactPhone || 'Contato';
        const unreadCount = 1; // assignment implies a new unread event
        const messagePreview = `Conversa atribuída a ${assignedUser.username || 'você'}`;
        triggerNotification(contactName, unreadCount, messagePreview, selectedConv.id, selectedConv.accountId);
      }
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

  const handleToggleMuteConversation = async () => {
    if (!selectedConv || muteBusy) return;
    const nextMuted = !selectedConv.isMuted;
    setMuteBusy(true);
    try {
      const result = await conversationApi.setMuted(selectedConv.id, nextMuted);
      setSelectedConv(prev => prev?.id === selectedConv.id ? { ...prev, isMuted: result.isMuted } : prev);
      setConversations(prev => prev.map(conv =>
        conv.id === selectedConv.id ? { ...conv, isMuted: result.isMuted } : conv
      ));
    } catch (err: any) {
      alert(err.message || 'Não foi possível alterar o silenciamento da conversa');
    } finally {
      setMuteBusy(false);
    }
  };

  const selectedAccount = accounts.find(a =>
    a.id === (selectedConv?.accountId || (selectedAccountId === ALL_ACCOUNTS ? '' : selectedAccountId))
  );
  const isConnected = selectedAccount?.status === 'CONNECTED';

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedConv || !selectedConv.accountId || !isConnected) return;
    const text = newMessage.trim();
    const currentReply = replyingTo;
    setSending(true);
    setNewMessage('');
    setReplyingTo(null);
    try {
      await conversationApi.send(
        selectedConv.accountId,
        selectedConv.contactPhone,
        text,
        'text',
        undefined,
        undefined,
        undefined,
        selectedAttendantName || undefined,
        currentReply?.id,
        currentReply?.content,
      );
    } catch (err: any) {
      setNewMessage(text);
      setReplyingTo(currentReply);
      alert('Erro ao enviar: ' + (err.message || 'tente novamente'));
    }
    finally { setSending(false); }
  };

  const handleSendFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConv || !selectedConv.accountId || !isConnected) return;
    const currentReply = replyingTo;
    setSending(true);
    setReplyingTo(null);
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
        selectedAttendantName || undefined,
        currentReply?.id,
        currentReply?.content,
       );
       setNewMessage('');
      await loadMessages(selectedConv.id, 1);
    } catch (err: any) {
      setReplyingTo(currentReply);
      alert('Erro ao enviar arquivo: ' + (err.message || 'tente novamente'));
    }
    finally {
      setSending(false);
      e.target.value = '';
    }
  };

  const handleSendForward = async () => {
    if (!forwardingMsg || selectedForwardConvIds.length === 0 || forwardingBusy) return;
    setForwardingBusy(true);

    try {
      const targetConvs = conversations.filter(c => selectedForwardConvIds.includes(c.id));
      const content = forwardingMsg.content || '';
      const type = forwardingMsg.mediaType || 'text';
      const mediaUrl = forwardingMsg.mediaUrl || undefined;

      for (const target of targetConvs) {
        if (!target.accountId || !target.contactPhone) continue;
        await conversationApi.send(
          target.accountId,
          target.contactPhone,
          content,
          type,
          mediaUrl,
          undefined,
          undefined,
          selectedAttendantName || undefined,
        );
      }

      if (selectedConv && selectedForwardConvIds.includes(selectedConv.id)) {
        await loadMessages(selectedConv.id, 1);
      }

      setForwardingMsg(null);
      setSelectedForwardConvIds([]);
      setForwardSearch('');
    } catch (err: any) {
      alert('Erro ao encaminhar mensagem: ' + (err.message || 'Tente novamente'));
    } finally {
      setForwardingBusy(false);
    }
  };

  const renderContent = (text: string | null) => {
    if (!text) return null;
    let safeText = text;
    if (safeText === '[secretEncryptedMessage]') safeText = '🔒 [Mensagem protegida por criptografia]';
    else if (safeText === '[templateMessage]') safeText = '📋 [Mensagem interativa]';
    else if (safeText === '[messageContextInfo]' || safeText === '[unknown]') safeText = 'ℹ️ [Mensagem do sistema]';

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = safeText.split(urlRegex);
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
      {syncProgress && !hideSyncProgress && (
        <div
          className={`rounded-2xl border p-3.5 sm:p-4 shadow-sm relative pr-12 ${
            syncProgress.status === 'error'
              ? 'bg-red-50 border-red-200'
              : syncProgress.status === 'completed'
                ? 'bg-emerald-50 border-emerald-200'
                : 'bg-white/90 backdrop-blur-md border-monte-sereno/20'
          }`}
          role="status"
          aria-live="polite"
        >
          {/* Botão flutuante de fechar/ocultar (otimizado para toque no celular) */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleHideSyncProgress(true);
            }}
            className="absolute top-2.5 right-2.5 p-2 text-monte-sereno hover:text-monte-terracota active:scale-95 bg-black/5 hover:bg-black/10 rounded-full transition-all flex items-center justify-center z-20 touch-manipulation cursor-pointer shadow-2xs"
            title="Ocultar barra de sincronização"
            aria-label="Ocultar barra de sincronização"
          >
            <X className="w-5 h-5 stroke-[2.5]" />
          </button>

          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="min-w-0 pr-2">
              <p className="text-sm font-bold text-monte-azul truncate">
                {syncProgress.status === 'completed' ? 'Sincronização concluída' : syncProgress.status === 'error' ? 'Sincronização interrompida' : 'Sincronizando tudo...'}
              </p>
              <p className="text-xs text-monte-sereno truncate">{syncProgress.message}</p>
            </div>
            <div className="text-right flex-shrink-0 mr-2">
              <p className="text-base sm:text-lg font-bold text-monte-verde">{Math.round(syncProgress.percent)}%</p>
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

          <div className="flex items-center justify-between mt-2 pt-1">
            {syncProgress.totalMessages > 0 ? (
              <p className="text-[11px] text-monte-sereno truncate">
                {syncProgress.processedMessages.toLocaleString('pt-BR')} de {syncProgress.totalMessages.toLocaleString('pt-BR')} mensagens
              </p>
            ) : <span />}
            <button
              type="button"
              onClick={() => toggleHideSyncProgress(true)}
              className="text-xs font-bold text-monte-terracota hover:bg-monte-terracota/10 px-2.5 py-1 rounded-full transition-colors inline-flex items-center gap-1 sm:hidden cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Ocultar</span>
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-1 h-full lg:h-[calc(100vh-8rem)] -m-0 lg:-m-6 rounded-none lg:rounded-3xl overflow-hidden lg:shadow-lg lg:border border-monte-sereno/15 relative">
      {/* Sidebar - conversations list */}
      <div className={`w-full lg:w-80 bg-white/85 backdrop-blur-md flex flex-col flex-shrink-0 lg:border-r border-monte-sereno/15 ${
        selectedConv ? 'hidden lg:flex' : 'flex h-full pb-20 lg:pb-0'
      }`}>
        {/* Mobile Header da lista estilo WhatsApp */}
        <div className="px-4 py-3 flex items-center justify-between lg:hidden border-b border-monte-sereno/10 bg-white shadow-2xs">
          <div className="flex items-center gap-2">
            {(location.state as any)?.from && (
              <button
                type="button"
                onClick={() => navigate((location.state as any).from)}
                className="p-1 -ml-1 text-monte-azul hover:text-monte-verde rounded-full"
                title="Voltar para a página anterior"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold font-display text-monte-azul leading-none">Conversas</h2>
              <p className="text-[11px] text-monte-sereno mt-0.5 font-medium">
                {accounts.length > 0 && selectedAccountId !== ALL_ACCOUNTS
                  ? (accounts.find(a => a.id === selectedAccountId)?.name || 'WhatsApp')
                  : 'Todas as contas'}
              </p>
            </div>
          </div>
          {syncing && (
            <div className="flex items-center gap-1.5 text-xs text-monte-verde font-semibold bg-monte-verde/10 px-2.5 py-1 rounded-full animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Sincronizando
            </div>
          )}
        </div>

        {accounts.length > 1 && (
          <div className="p-2.5 sm:p-3 border-b border-monte-sereno/15">
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
             onClick={toggleIncludeGroups}
             title={!includeGroups ? 'Filtro ativo: Sem grupos (clique para exibir grupos)' : 'Exibindo grupos (clique para ocultar grupos)'}
             aria-label={!includeGroups ? 'Filtro ativo: Sem grupos' : 'Exibindo grupos'}
             className={`px-3 py-1.5 rounded-full transition-all flex-shrink-0 flex items-center gap-1.5 text-xs ${
               !includeGroups
                 ? 'bg-monte-verde/15 text-monte-verde border border-monte-verde/30 font-semibold shadow-2xs'
                 : 'text-monte-sereno hover:text-monte-verde hover:bg-monte-verde/10 border border-transparent font-medium'
             }`}
           >
             {!includeGroups ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
             <span className="hidden sm:inline">
               {!includeGroups ? 'Sem grupos' : 'Com grupos'}
             </span>
           </button>
           {syncProgress && hideSyncProgress && (
             <button
               type="button"
               onClick={() => toggleHideSyncProgress(false)}
               title="Exibir barra de progresso da sincronização"
               className="px-2.5 py-1 rounded-full text-monte-verde bg-monte-verde/10 hover:bg-monte-verde/20 transition-colors flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold shadow-2xs"
             >
               <RefreshCw className="w-3 h-3 animate-spin" />
               <span>{Math.round(syncProgress.percent)}%</span>
             </button>
           )}
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
                      <p className="text-xs text-monte-sereno truncate">{formatLastMessagePreview(conv.lastMessage)}</p>
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
      <div className={`flex-1 flex flex-col bg-monte-areia ${
        !selectedConv ? 'hidden lg:flex' : 'flex h-full fixed inset-0 z-40 lg:static lg:z-auto'
      }`}>
        {selectedConv ? (
          <>
            {/* Header estilo WhatsApp */}
            <div className="bg-white border-b border-monte-sereno/15 px-3 sm:px-4 pt-safe pb-2.5 flex items-center justify-between gap-3 shadow-2xs z-10">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={handleBackToConversations}
                  className="p-1.5 -ml-1.5 text-monte-azul hover:text-monte-verde rounded-full active:scale-95 transition-transform"
                  title="Voltar para a lista"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <div
                  onClick={() => setShowContactDetails(true)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer hover:opacity-90 transition-opacity"
                >
                  <Avatar contactId={selectedConv.contactId} name={selectedConv.contactName} phone={selectedConv.contactPhone} size="w-10 h-10" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm sm:text-base text-monte-azul font-display truncate leading-tight">
                      {selectedConv.contactName || formatContactPhone(selectedConv.contactPhone)}
                    </p>
                    <p className="text-[11px] text-monte-sereno truncate mt-0.5 flex items-center gap-1.5">
                      {selectedConv.aiEnabled === false ? (
                        <span className="text-monte-terracota font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-monte-terracota" />
                          Atendimento humano
                        </span>
                      ) : (
                        <span className="text-monte-verde font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-monte-verde" />
                          IA ativa
                        </span>
                      )}
                      {selectedAccountId === ALL_ACCOUNTS && selectedConv.accountName && (
                        <span className="text-monte-sereno/80">· {selectedConv.accountName}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Botão de Opções do Contato e CRM */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedContactForCrm({
                    id: selectedConv.contactId,
                    name: selectedConv.contactName,
                    phone: selectedConv.contactPhone,
                    conversationId: selectedConv.id,
                  })}
                  className="px-3 py-1.5 bg-monte-verde/10 hover:bg-monte-verde text-monte-verde hover:text-white rounded-full transition-all text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
                  title="Ver Cadastro e Produtos no CRM"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Ver Cadastro CRM</span>
                </button>
                {togglePopoutWindow && (
                  <button
                    type="button"
                    onClick={togglePopoutWindow}
                    className="p-2 text-monte-azul/70 hover:text-monte-verde hover:bg-monte-areiaSecao rounded-full transition-colors hidden md:flex items-center gap-1 cursor-pointer"
                    title="Abrir WhatsApp em Janela Destacada (Pop-out / Picture in Picture)"
                  >
                    <ExternalLink className="w-4.5 h-4.5" />
                  </button>
                )}
                {setIsFocusMode && (
                  <button
                    type="button"
                    onClick={() => setIsFocusMode((v: boolean) => !v)}
                    className="p-2 text-monte-azul/70 hover:text-monte-verde hover:bg-monte-areiaSecao rounded-full transition-colors hidden md:flex items-center gap-1 cursor-pointer"
                    title={isFocusMode ? 'Sair do Modo Foco' : 'Modo Foco Total (Destacar Canvas)'}
                  >
                    {isFocusMode ? <Minimize2 className="w-4.5 h-4.5 text-monte-terracota" /> : <Maximize2 className="w-4.5 h-4.5" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowContactDetails(v => !v)}
                  className="p-2 text-monte-azul/70 hover:text-monte-azul hover:bg-monte-areiaSecao rounded-full transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Opções da conversa"
                >
                  <SlidersHorizontal className="w-5 h-5" />
                  <span className="hidden sm:inline text-xs font-medium">Opções</span>
                </button>
              </div>
            </div>


            {/* Linha secundária de opções rápidas (disponível no mobile e desktop) */}
            <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-white/70 backdrop-blur-xs border-b border-monte-sereno/10 text-xs gap-2">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {(selectedConv.tags || []).map((tag: ConversationTag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{ color: tag.color, borderColor: tag.color, backgroundColor: `${tag.color}12` }}
                  >
                    <TagIcon className="w-3 h-3" />
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag.id)}
                      disabled={tagBusy}
                      className="rounded-full hover:bg-black/10 disabled:opacity-50"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {availableTags.some(tag => !(selectedConv.tags || []).some(current => current.id === tag.id)) && (
                  <select
                    className="input-rect py-0.5 px-2 text-[10px] w-auto max-w-[150px]"
                    value=""
                    onChange={e => handleAddTag(e.target.value)}
                    disabled={tagBusy}
                  >
                    <option value="">+ Etiqueta</option>
                    {availableTags
                      .filter(tag => !(selectedConv.tags || []).some(current => current.id === tag.id))
                      .map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                {attendants.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-monte-sereno" />
                    <select
                      className="input-rect py-0.5 px-2 text-[10px] w-auto max-w-[150px]"
                      value={selectedConv.assignedUser?.id || ''}
                      onChange={e => handleAssignConversation(e.target.value)}
                      disabled={assignmentBusy}
                    >
                      <option value="">Sem responsável</option>
                      {attendants.map(attendant => (
                        <option key={attendant.id} value={attendant.id}>{attendant.username}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleToggleMuteConversation}
                  disabled={muteBusy}
                  className={`text-[10px] font-semibold rounded-full px-2.5 py-0.5 border transition-colors disabled:opacity-50 flex items-center gap-1 ${
                    selectedConv.isMuted
                      ? 'border-amber-500/40 text-amber-600 bg-amber-50'
                      : 'border-monte-sereno/30 text-monte-sereno hover:bg-black/5'
                  }`}
                  title={selectedConv.isMuted ? 'Reativar notificações do contato' : 'Silenciar notificações do contato'}
                >
                  {selectedConv.isMuted ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
                  <span>{selectedConv.isMuted ? 'Notificações silenciadas' : 'Notificações ativadas'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleAi}
                  disabled={aiBusy}
                  className={`text-[10px] font-semibold rounded-full px-2.5 py-0.5 border transition-colors disabled:opacity-50 ${
                    selectedConv.aiEnabled === false
                      ? 'border-monte-verde/30 text-monte-verde hover:bg-monte-verde/10'
                      : 'border-monte-terracota/30 text-monte-terracota hover:bg-monte-terracota/10'
                  }`}
                >
                  {aiBusy ? 'Salvando...' : selectedConv.aiEnabled === false ? 'Reativar IA' : 'Desligar IA e assumir'}
                </button>
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
                <ChatMessageItem
                  key={msg.id}
                  msg={msg}
                  selectedConvName={selectedConv.contactName || selectedConv.contactPhone || 'Contato'}
                  onReply={(m) => setReplyingTo({
                    id: m.id,
                    content: formatLastMessagePreview(m.content || (m.mediaType ? `[${m.mediaType}]` : 'Mensagem')),
                    senderName: m.senderName || (m.isFromMe ? 'Sem identificação' : (selectedConv.contactName || selectedConv.contactPhone || 'Contato')),
                  })}
                  onForward={(m) => {
                    setForwardingMsg(m);
                    setSelectedForwardConvIds([]);
                    setForwardSearch('');
                  }}
                  renderContent={renderContent}
                />
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

            {/* Input com Safe Area do iPhone */}
            <div className="bg-white/90 backdrop-blur-md border-t border-monte-sereno/15 p-2 sm:p-3 pb-safe relative">
              {/* Menu Flutuante ao Digitar /atalho */}
              {slashQuery !== null && matchingQuickMessages.length > 0 && (
                <div className="absolute bottom-full mb-2 left-2 right-2 sm:left-12 sm:right-12 max-w-lg bg-white rounded-2xl shadow-2xl border border-emerald-300 p-2 z-40 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between px-2.5 py-1 mb-1 border-b border-slate-100 text-[11px] text-slate-500 font-medium">
                    <span className="flex items-center gap-1.5 text-monte-verde font-semibold">
                      <Zap className="w-3.5 h-3.5" />
                      Mensagens Rápidas
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      Use ↑ ↓ e Enter para inserir (Esc fecha)
                    </span>
                  </div>
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {matchingQuickMessages.map((qm, idx) => {
                      const isHighlighted = idx === slashIndex;
                      return (
                        <button
                          key={qm.id}
                          type="button"
                          onClick={() => handleSelectQuickMessage(qm)}
                          onMouseEnter={() => setSlashIndex(idx)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg transition-colors flex items-start justify-between gap-2 ${
                            isHighlighted
                              ? 'bg-emerald-50 text-monte-azul border border-emerald-200'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-xs text-monte-verde">
                                /{qm.shortcut}
                              </span>
                              <span className="text-xs font-semibold text-slate-800 truncate">
                                {qm.title}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5 font-normal">
                              {qm.content}
                            </p>
                          </div>
                          {qm.category && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                              {qm.category}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Popover do Catálogo de Mensagens Rápidas (botão ⚡) */}
              {showQuickMenu && (
                <div
                  ref={quickMenuRef}
                  className="absolute bottom-full mb-2 left-2 sm:left-4 w-[92vw] sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-40 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                    <span className="flex items-center gap-1.5 font-bold text-xs text-monte-azul">
                      <Zap className="w-4 h-4 text-monte-verde" />
                      Mensagens Rápidas
                    </span>
                    <div className="flex items-center gap-2">
                      <Link
                        to="/mensagem"
                        className="text-[11px] text-monte-verde hover:underline font-medium"
                      >
                        Gerenciar
                      </Link>
                      <button
                        type="button"
                        onClick={() => setShowQuickMenu(false)}
                        className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="relative mb-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Pesquisar atalho ou texto..."
                      value={quickSearch}
                      onChange={e => setQuickSearch(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-monte-verde"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1 max-h-60 overflow-y-auto">
                    {filteredQuickMenuMessages.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs">
                        Nenhuma mensagem rápida encontrada.
                        <div className="mt-2">
                          <Link to="/mensagem" className="btn-primary text-[11px] py-1 px-3">
                            Cadastrar em /mensagem
                          </Link>
                        </div>
                      </div>
                    ) : (
                      filteredQuickMenuMessages.map(qm => (
                        <button
                          key={qm.id}
                          type="button"
                          onClick={() => handleSelectQuickMessage(qm)}
                          className="w-full text-left p-2 rounded-lg hover:bg-emerald-50/70 border border-transparent hover:border-emerald-200 transition-colors flex flex-col gap-0.5 group"
                        >
                          <div className="flex items-center justify-between gap-1 w-full">
                            <span className="font-mono font-bold text-xs text-monte-verde">
                              /{qm.shortcut}
                            </span>
                            <span className="text-xs font-semibold text-slate-800 truncate flex-1 ml-1.5">
                              {qm.title}
                            </span>
                            {qm.category && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                {qm.category}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                            {qm.content}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Banner de resposta a mensagem citada */}
              {replyingTo && (
                <div className="bg-monte-areiaSecao/90 border border-monte-sereno/20 rounded-xl mb-2 px-3 py-2 flex items-center justify-between gap-2 text-xs shadow-xs">
                  <div className="flex items-center gap-2 overflow-hidden border-l-4 border-monte-verde pl-2.5 py-0.5 min-w-0">
                    <Reply className="w-4 h-4 text-monte-verde flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold text-monte-azul text-[11px] truncate">
                        Respondendo a <span className="text-monte-verde font-bold">{replyingTo.senderName}</span>
                      </p>
                      <p className="text-monte-sereno truncate text-[11px] opacity-90">{replyingTo.content}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-1 text-monte-sereno hover:text-monte-terracota rounded-full transition-colors flex-shrink-0"
                    title="Cancelar resposta"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              {attendants.length > 0 && (
                <div className="flex items-center justify-end gap-2 mb-1.5 px-1">
                  <label htmlFor="attendant-select" className="text-[10px] font-semibold text-monte-sereno">
                    Enviar como:
                  </label>
                  <select
                    id="attendant-select"
                    className="bg-transparent text-[11px] font-medium text-monte-azul focus:outline-none cursor-pointer"
                    value={selectedAttendantName}
                    onChange={e => handleAttendantChange(e.target.value)}
                    disabled={sending}
                  >
                    <option value="">Sem identificação</option>
                    {attendants.map(attendant => (
                      <option key={attendant.id} value={attendant.username}>{attendant.username}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickMenu(prev => !prev)}
                  className={`p-2 sm:p-2.5 rounded-full cursor-pointer transition-colors ${
                    showQuickMenu ? 'bg-monte-verde text-white shadow-sm' : 'text-monte-sereno hover:text-monte-verde hover:bg-monte-areiaSecao'
                  }`}
                  title="Mensagens Rápidas (/atalho)"
                  disabled={!isConnected}
                >
                  <Zap className="w-5 h-5" />
                </button>
                <label className={`p-2 sm:p-2.5 rounded-full cursor-pointer transition-colors ${isConnected ? 'text-monte-sereno hover:text-monte-verde hover:bg-monte-areiaSecao' : 'text-monte-sereno/30 cursor-not-allowed'}`} title="Enviar imagem">
                  <ImageIcon className="w-5 h-5" />
                  <input type="file" accept="image/*" className="hidden" onChange={handleSendFile} disabled={sending || !isConnected} />
                </label>
                <label className={`p-2 sm:p-2.5 rounded-full cursor-pointer transition-colors ${isConnected ? 'text-monte-sereno hover:text-monte-verde hover:bg-monte-areiaSecao' : 'text-monte-sereno/30 cursor-not-allowed'}`} title="Enviar documento ou mídia">
                  <Paperclip className="w-5 h-5" />
                  <input type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" className="hidden" onChange={handleSendFile} disabled={sending || !isConnected} />
                </label>
                <textarea
                  ref={textareaRef}
                  className="input-rect flex-1 resize-none min-h-[42px] max-h-32 text-base sm:text-sm py-2 px-3.5 leading-relaxed rounded-2xl"
                  rows={1}
                  placeholder={isConnected ? 'Mensagem... (digite / para atalhos)' : 'WhatsApp desconectado...'}
                  value={newMessage}
                  onChange={e => {
                    setNewMessage(e.target.value);
                    if (dismissedSlash && !e.target.value.includes('/')) {
                      setDismissedSlash(false);
                    }
                  }}
                  onKeyDown={e => {
                    if (slashQuery !== null && matchingQuickMessages.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSlashIndex(prev => (prev + 1) % matchingQuickMessages.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSlashIndex(prev => (prev - 1 + matchingQuickMessages.length) % matchingQuickMessages.length);
                        return;
                      }
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        const selected = matchingQuickMessages[slashIndex] || matchingQuickMessages[0];
                        if (selected) {
                          handleSelectQuickMessage(selected);
                        }
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setDismissedSlash(true);
                        return;
                      }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={!isConnected}
                />
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim() || sending || !isConnected}
                  className="btn-primary p-2.5 rounded-full disabled:opacity-50 transition-all flex-shrink-0 flex items-center justify-center shadow-sm"
                  title="Enviar mensagem"
                >
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
            <div className="text-center p-6">
              <MessageSquare className="w-16 h-16 mx-auto mb-3 opacity-20" />
              <p className="text-lg font-display font-semibold text-monte-azul">Selecione uma conversa</p>
              <p className="text-sm mt-1 opacity-70 max-w-xs mx-auto">Escolha uma conversa na lista lateral para iniciar ou continuar o atendimento.</p>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* Drawer / Modal de Detalhes da Conversa (Mobile & Desktop) */}
      {showContactDetails && selectedConv && (
        <div className="fixed inset-0 z-50 bg-monte-azul/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setShowContactDetails(false)}
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-monte-sereno/20 p-5 z-10 max-h-[85vh] overflow-y-auto pb-safe animate-in slide-in-from-bottom-6 duration-200">
            {/* Header do modal */}
            <div className="flex items-center justify-between pb-3 border-b border-monte-sereno/15">
              <h3 className="font-bold text-base text-monte-azul font-display flex items-center gap-2">
                <Info className="w-4 h-4 text-monte-verde" /> Detalhes da Conversa
              </h3>
              <button
                type="button"
                onClick={() => setShowContactDetails(false)}
                className="p-1.5 rounded-full text-monte-sereno hover:text-monte-azul hover:bg-monte-areiaSecao transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Informações do contato */}
            <div className="py-4 text-center border-b border-monte-sereno/10">
              <div className="flex justify-center mb-2">
                <Avatar contactId={selectedConv.contactId} name={selectedConv.contactName} phone={selectedConv.contactPhone} size="w-16 h-16" textClass="text-2xl" />
              </div>
              <h4 className="font-bold text-lg text-monte-azul font-display">
                {selectedConv.contactName || formatContactPhone(selectedConv.contactPhone)}
              </h4>
              <p className="text-xs text-monte-sereno mt-0.5">
                {selectedConv.contactPhone.includes('@g.us')
                  ? 'Grupo do WhatsApp'
                  : selectedConv.contactPhone}
              </p>
              {selectedConv.accountName && (
                <span className="inline-block mt-1.5 text-[11px] font-medium bg-monte-verde/10 text-monte-verde px-2.5 py-0.5 rounded-full">
                  WhatsApp: {selectedConv.accountName}
                </span>
              )}
            </div>

            {/* Cadastro & Produtos no CRM */}
            <div className="py-3 border-b border-monte-sereno/10">
              <p className="text-xs font-bold text-monte-sereno uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-monte-verde" /> Cadastro & Produtos no CRM
              </p>
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-monte-verde/10 via-monte-azul/5 to-monte-verde/10 border border-monte-verde/20 space-y-2">
                <p className="text-xs text-monte-azul font-medium">
                  Consulte os produtos, apólices de seguro ativas e negócios no funil do cliente no CRM da Monteiro Seguros.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowContactDetails(false);
                    setSelectedContactForCrm({
                      id: selectedConv.contactId,
                      name: selectedConv.contactName,
                      phone: selectedConv.contactPhone,
                      conversationId: selectedConv.id,
                    });
                  }}
                  className="w-full py-2 bg-gradient-to-r from-monte-verde to-monte-azul text-white text-xs font-bold rounded-xl shadow-xs hover:opacity-95 transition-opacity flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" /> Ver Cadastro e Produtos Completo
                </button>
              </div>
            </div>

            {/* Silenciamento de Notificações do Contato */}
            <div className="py-3 border-b border-monte-sereno/10">
              <p className="text-xs font-bold text-monte-sereno uppercase tracking-wider mb-2 flex items-center gap-1.5">
                {selectedConv.isMuted ? <BellOff className="w-3.5 h-3.5 text-amber-600" /> : <Bell className="w-3.5 h-3.5 text-monte-verde" />} Notificações do Contato
              </p>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-monte-areiaSecao/60 border border-monte-sereno/10">
                <div className="flex items-center gap-2.5">
                  {selectedConv.isMuted ? (
                    <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                      <BellOff className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-monte-verde/10 text-monte-verde flex items-center justify-center flex-shrink-0">
                      <Bell className="w-4 h-4" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-monte-azul">
                      {selectedConv.isMuted ? 'Notificações silenciadas' : 'Notificações ativadas'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleMuteConversation}
                  disabled={muteBusy}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all disabled:opacity-50 flex-shrink-0 ${
                    selectedConv.isMuted
                      ? 'border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100'
                      : 'border-monte-sereno/30 text-monte-sereno hover:bg-black/5'
                  }`}
                >
                  {muteBusy ? 'Salvando...' : selectedConv.isMuted ? 'Reativar' : 'Silenciar'}
                </button>
              </div>
            </div>

            {/* Controle da IA */}

            <div className="py-3 border-b border-monte-sereno/10">
              <p className="text-xs font-bold text-monte-sereno uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" /> Inteligência Artificial
              </p>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-monte-areiaSecao/60 border border-monte-sereno/10">
                <div>
                  <p className="text-sm font-semibold text-monte-azul">
                    {selectedConv.aiEnabled === false ? 'Atendimento Humano' : 'IA Ativa'}
                  </p>
                  <p className="text-[11px] text-monte-sereno mt-0.5">
                    {selectedConv.aiEnabled === false
                      ? 'A IA está pausada para este contato.'
                      : 'A IA responde às perguntas do contato automaticamente.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAi}
                  disabled={aiBusy}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all disabled:opacity-50 flex-shrink-0 ${
                    selectedConv.aiEnabled === false
                      ? 'border-monte-verde bg-monte-verde text-white shadow-xs'
                      : 'border-monte-terracota text-monte-terracota hover:bg-monte-terracota/10'
                  }`}
                >
                  {aiBusy ? 'Salvando...' : selectedConv.aiEnabled === false ? 'Reativar IA' : 'Pausar IA'}
                </button>
              </div>
            </div>

            {/* Atendente responsável */}
            <div className="py-3 border-b border-monte-sereno/10">
              <p className="text-xs font-bold text-monte-sereno uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" /> Atendente Responsável
              </p>
              {attendants.length > 0 ? (
                <select
                  className="input-rect text-sm w-full"
                  value={selectedConv.assignedUser?.id || ''}
                  onChange={e => handleAssignConversation(e.target.value)}
                  disabled={assignmentBusy}
                >
                  <option value="">Nenhum atendente (Livre)</option>
                  {attendants.map(attendant => (
                    <option key={attendant.id} value={attendant.id}>{attendant.username}</option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-monte-sereno">Nenhum atendente cadastrado no sistema.</p>
              )}
            </div>

            {/* Etiquetas */}
            <div className="py-3">
              <p className="text-xs font-bold text-monte-sereno uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <TagIcon className="w-3.5 h-3.5" /> Etiquetas do Contato
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                {(selectedConv.tags || []).map((tag: ConversationTag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
                    style={{ color: tag.color, borderColor: tag.color, backgroundColor: `${tag.color}15` }}
                  >
                    <TagIcon className="w-3 h-3" />
                    {tag.name}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag.id)}
                      disabled={tagBusy}
                      className="rounded-full hover:bg-black/10 p-0.5"
                      title="Remover"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {!selectedConv.tags?.length && (
                  <span className="text-xs text-monte-sereno italic">Sem etiquetas aplicadas.</span>
                )}
              </div>

              {availableTags.some(tag => !(selectedConv.tags || []).some(current => current.id === tag.id)) && (
                <select
                  className="input-rect text-xs w-full"
                  value=""
                  onChange={e => handleAddTag(e.target.value)}
                  disabled={tagBusy}
                >
                  <option value="">+ Adicionar uma etiqueta...</option>
                  {availableTags
                    .filter(tag => !(selectedConv.tags || []).some(current => current.id === tag.id))
                    .map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-monte-sereno/15 flex justify-end">
              <button
                type="button"
                onClick={() => setShowContactDetails(false)}
                className="btn-primary w-full py-2.5 text-sm font-semibold"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Detalhes do CRM Monteiro Seguros */}
      {selectedContactForCrm && (
        <CrmContactModal
          contact={selectedContactForCrm}
          onClose={() => setSelectedContactForCrm(null)}
        />
      )}

      {/* Modal de Encaminhamento de Mensagem */}
      {forwardingMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh] border border-monte-sereno/20">
            {/* Header do Modal */}
            <div className="px-5 py-4 bg-monte-areiaSecao border-b border-monte-sereno/15 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-monte-verde" />
                <h3 className="font-bold font-display text-monte-azul text-base">Encaminhar mensagem</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setForwardingMsg(null);
                  setSelectedForwardConvIds([]);
                  setForwardSearch('');
                }}
                className="p-1.5 text-monte-sereno hover:text-monte-terracota rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview da Mensagem a ser Encaminhada */}
            <div className="p-3.5 bg-monte-verde/5 border-b border-monte-sereno/10 text-xs">
              <p className="font-semibold text-monte-azul mb-1 text-[11px] opacity-70">Conteúdo a encaminhar:</p>
              <div className="bg-white p-2.5 rounded-xl border border-monte-sereno/15 text-monte-azul line-clamp-3 break-words font-medium">
                {forwardingMsg.mediaType && forwardingMsg.mediaType !== 'text' && (
                  <span className="font-bold text-monte-verde mr-1">[{forwardingMsg.mediaType.toUpperCase()}]</span>
                )}
                {forwardingMsg.content || 'Mídia da mensagem'}
              </div>
            </div>

            {/* Campo de Busca de Conversas */}
            <div className="p-3 border-b border-monte-sereno/10 bg-white">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno" />
                <input
                  type="text"
                  className="input-rect pl-9 py-2 text-xs w-full"
                  placeholder="Buscar contato ou grupo..."
                  value={forwardSearch}
                  onChange={e => setForwardSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Lista de Conversas para Seleção */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-monte-sereno/5">
              {conversations
                .filter(c => {
                  if (!forwardSearch.trim()) return true;
                  const term = forwardSearch.toLowerCase();
                  return (
                    (c.contactName && c.contactName.toLowerCase().includes(term)) ||
                    (c.contactPhone && c.contactPhone.toLowerCase().includes(term))
                  );
                })
                .map(conv => {
                  const isSelected = selectedForwardConvIds.includes(conv.id);
                  return (
                    <div
                      key={conv.id}
                      onClick={() => {
                        setSelectedForwardConvIds(prev =>
                          isSelected ? prev.filter(id => id !== conv.id) : [...prev, conv.id]
                        );
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-colors ${
                        isSelected ? 'bg-monte-verde/10 border border-monte-verde/30' : 'hover:bg-monte-areia'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar contactId={conv.contactId} name={conv.contactName} phone={conv.contactPhone} size="w-9 h-9" />
                        <div className="min-w-0">
                          <p className="font-semibold text-xs text-monte-azul truncate">
                            {conv.contactName || formatContactPhone(conv.contactPhone)}
                          </p>
                          <p className="text-[10px] text-monte-sereno truncate">
                            {conv.accountName || 'WhatsApp'}
                          </p>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-monte-verde border-monte-verde text-white' : 'border-monte-sereno/30 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-3.5 bg-white border-t border-monte-sereno/15 flex items-center justify-between gap-2">
              <span className="text-xs text-monte-sereno font-medium">
                {selectedForwardConvIds.length} selecionado(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setForwardingMsg(null);
                    setSelectedForwardConvIds([]);
                    setForwardSearch('');
                  }}
                  className="px-4 py-2 text-xs font-semibold text-monte-sereno hover:bg-black/5 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSendForward}
                  disabled={selectedForwardConvIds.length === 0 || forwardingBusy}
                  className="btn-primary text-xs py-2 px-4 shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {forwardingBusy ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Share2 className="w-3.5 h-3.5" />
                  )}
                  <span>Encaminhar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

