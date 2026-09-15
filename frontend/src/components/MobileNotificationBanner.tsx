import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { Bell, X, MessageSquare, ChevronRight } from 'lucide-react';

export default function MobileNotificationBanner() {
  const { activeMobileBanner, dismissBanner, iosDisplayMode, muted } = useNotification();
  const navigate = useNavigate();

  if (!activeMobileBanner || muted) return null;

  const { contactName, unreadCount, messagePreview, conversationId, accountId } = activeMobileBanner;

  const handleClick = () => {
    dismissBanner();
    if (conversationId) {
      navigate('/conversations', {
        state: { conversationId, accountId },
      });
    } else {
      navigate('/conversations');
    }
  };

  const unreadLabel = unreadCount === 1 ? '1 mensagem não lida' : `${unreadCount} mensagens não lidas`;

  // Estilo minimalista de "Contagem" (Count mode)
  if (iosDisplayMode === 'count') {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-sm animate-in fade-in slide-in-from-top-4 duration-300">
        <div
          onClick={handleClick}
          className="bg-monte-azul/95 backdrop-blur-2xl text-white px-4 py-2.5 rounded-full shadow-2xl border border-white/20 flex items-center justify-between cursor-pointer active:scale-95 transition-transform"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-monte-verde text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {contactName[0]?.toUpperCase()}
            </div>
            <p className="text-xs font-semibold truncate">
              <span className="text-white font-bold">{contactName}</span>
              <span className="mx-1 text-white/50">•</span>
              <span className="text-monte-areia font-medium">{unreadLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); dismissBanner(); }}
            className="p-1 text-white/60 hover:text-white rounded-full"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // Estilo "Empilhadas" (Stack mode)
  if (iosDisplayMode === 'stack') {
    return (
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-in fade-in slide-in-from-top-6 duration-300">
        <div className="relative">
          {/* Stack background layer 2 */}
          <div className="absolute top-2 left-3 right-3 h-12 bg-white/40 backdrop-blur-md rounded-3xl border border-white/30 -z-20 scale-95 shadow-xs" />
          {/* Stack background layer 1 */}
          <div className="absolute top-1 left-1.5 right-1.5 h-14 bg-white/70 backdrop-blur-md rounded-3xl border border-white/40 -z-10 scale-[0.98] shadow-sm" />

          {/* Main Card */}
          <div
            onClick={handleClick}
            className="bg-white/95 backdrop-blur-2xl border border-monte-sereno/25 p-3.5 rounded-3xl shadow-2xl cursor-pointer active:scale-98 transition-all"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-monte-verde uppercase tracking-wider">
                <MessageSquare className="w-3.5 h-3.5" /> Monteiro Conecta (Empilhado)
              </div>
              <span className="text-[10px] bg-monte-terracota/10 text-monte-terracota font-bold px-2 py-0.5 rounded-full">
                {unreadLabel}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-monte-verde to-monte-azul text-white font-bold flex items-center justify-center text-sm shadow-md flex-shrink-0">
                {contactName[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-monte-azul truncate">{contactName}</p>
                <p className="text-xs text-monte-sereno truncate mt-0.5">{messagePreview}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-monte-sereno flex-shrink-0" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Estilo "Banner" padrão (Dynamic Island iOS Banner)
  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md animate-in fade-in slide-in-from-top-8 duration-300">
      <div
        onClick={handleClick}
        className="group relative bg-monte-azul/95 backdrop-blur-2xl text-white p-3.5 rounded-[28px] shadow-2xl border border-white/20 cursor-pointer active:scale-98 transition-all overflow-hidden"
      >
        {/* Glowing top line */}
        <div className="absolute top-0 left-8 right-8 h-[2px] bg-gradient-to-r from-transparent via-monte-verde to-transparent opacity-80" />

        <div className="flex items-start gap-3">
          {/* Contact Avatar with Notification Badge */}
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-monte-verde to-emerald-600 text-white font-bold text-base flex items-center justify-center shadow-md">
              {contactName[0]?.toUpperCase()}
            </div>
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-monte-terracota border-2 border-monte-azul flex items-center justify-center text-[9px] font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-white truncate tracking-tight">{contactName}</p>
              <span className="text-[10px] font-semibold text-emerald-300 bg-white/10 px-2 py-0.5 rounded-full flex-shrink-0">
                {unreadLabel}
              </span>
            </div>
            <p className="text-xs text-white/80 truncate mt-0.5 leading-relaxed font-normal">
              {messagePreview}
            </p>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); dismissBanner(); }}
            className="p-1 text-white/40 hover:text-white rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
