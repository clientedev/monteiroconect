import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { disconnectSocket } from '../lib/socket';
import ForceChangePasswordModal from './ForceChangePasswordModal';
import {
  LayoutDashboard, MessageSquare, Smartphone, Users, Tags, Bell, Megaphone, UserCheck,
  LogOut, Search, Menu, X, Bot, User, Clock, ArrowRight, Loader2, Sparkles, Phone, Settings,
  PanelLeftClose, PanelLeftOpen, Maximize2, Minimize2, ExternalLink,
} from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { dashboardApi } from '../lib/api';
import MobileNotificationBanner from './MobileNotificationBanner';

// Highlight matching search query in texts
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!text || !query.trim()) return <>{text}</>;
  const q = query.trim().toLowerCase();
  const index = text.toLowerCase().indexOf(q);
  if (index === -1) return <>{text}</>;

  const before = text.substring(0, index);
  const match = text.substring(index, index + q.length);
  const after = text.substring(index + q.length);

  return (
    <>
      {before}
      <span className="bg-amber-200/90 text-monte-azul font-semibold px-0.5 rounded">{match}</span>
      {after}
    </>
  );
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro ao renderizar a página:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card-static p-8 text-center max-w-xl mx-auto">
          <h2 className="section-title text-xl">Não foi possível abrir esta tela</h2>
          <p className="text-sm text-monte-sereno mt-2">
            A sessão ou os dados recebidos do servidor não puderam ser exibidos.
          </p>
          <button
            type="button"
            className="btn-primary mt-5"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/whatsapp', icon: Smartphone, label: 'Whatsapps' },
  { to: '/conversations', icon: MessageSquare, label: 'Conversas', showBadge: true },
  { to: '/broadcast', icon: Megaphone, label: 'Disparo' },
  { to: '/chatbots', icon: Bot, label: 'Chatbots' },
];

const manageItems = [
  { to: '/contacts', icon: Users, label: 'Contatos' },
  { to: '/attendants', icon: Users, label: 'Atendentes' },
  { to: '/tags', icon: Tags, label: 'Etiquetas' },
  { to: '/settings', icon: Settings, label: 'Notificações & Config' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  // Estados de navegação e exibição
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') === 'true'
  );
  const [isFocusMode, setIsFocusMode] = useState(false);
  const isPopout = useMemo(
    () => new URLSearchParams(location.search).get('popout') === 'true',
    [location.search]
  );

  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState<'all' | 'contacts' | 'conversations' | 'messages'>('all');
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadConversations, setUnreadConversations] = useState<any[]>([]);
  const [assignedCount, setAssignedCount] = useState(0);
  const [assignedConversations, setAssignedConversations] = useState<any[]>([]);
  const [showNotif, setShowNotif] = useState(false);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const togglePopoutWindow = () => {
    const url = window.location.origin + '/conversations?popout=true';
    window.open(
      url,
      'WhatsAppConversationsPopout',
      'width=1280,height=840,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
    );
  };

  // Redefine mobile chat state e reseta o scroll ao topo ao mudar de página
  useEffect(() => {
    if (!location.pathname.startsWith('/conversations')) {
      setIsMobileChatOpen(false);
    }
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sidebarOpen]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 60);
      } else if (e.key === 'Escape') {
        setSidebarOpen(false);
        setShowSearch(false);
        setShowNotif(false);
        if (isFocusMode) setIsFocusMode(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isFocusMode]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { searchApi } = await import('../lib/api');
        const res = await searchApi.search(searchQuery.trim());
        setSearchResults(res);
      } catch (err) {
        console.error('Erro na busca global:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadUnreadCount = useCallback(async () => {
    try {
      const stats = await dashboardApi.stats();
      setUnreadCount(stats.unreadMessages || 0);
      setUnreadConversations(stats.unreadConversations || []);
      setAssignedCount(stats.assignedCount || 0);
      setAssignedConversations(stats.assignedConversations || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 15000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  // Atualiza badge em tempo real
  useEffect(() => {
    if (!socket) return;

    const onNewMsg = () => loadUnreadCount();
    const onRead = () => loadUnreadCount();

    socket.on('message:new', onNewMsg);
    socket.on('conversation:read', onRead);
    return () => {
      socket.off('message:new', onNewMsg);
      socket.off('conversation:read', onRead);
    };
  }, [socket, loadUnreadCount]);

  const handleLogout = () => {
    disconnectSocket();
    logout();
    navigate('/login');
  };

  const handleOpenContact = (contact: any) => {
    setShowSearch(false);
    const convId = contact.conversations?.[0]?.id || contact.conversationId;
    if (convId) {
      navigate('/conversations', {
        state: { conversationId: convId, accountId: contact.whatsappId || contact.whatsapp?.id },
      });
    } else {
      navigate('/contacts', {
        state: { search: contact.phone || contact.name },
      });
    }
  };

  const handleOpenConversation = (conv: any) => {
    setShowSearch(false);
    navigate('/conversations', {
      state: { conversationId: conv.id, accountId: conv.whatsappId || conv.whatsapp?.id },
    });
  };

  const handleOpenMessage = (msg: any) => {
    setShowSearch(false);
    navigate('/conversations', {
      state: {
        conversationId: msg.conversationId || msg.conversation?.id,
        accountId: msg.conversation?.whatsappId || msg.conversation?.whatsapp?.id,
      },
    });
  };

  const openConversation = (conv: any) => {
    setShowNotif(false);
    navigate('/conversations', {
      state: { conversationId: conv.id, accountId: conv.whatsapp?.id },
    });
  };

  // MODO JANELA DESTACADA OU FOCO TOTAL
  if (isPopout || isFocusMode) {
    return (
      <div className="fixed inset-0 z-[9999] bg-monte-areia flex flex-col h-screen overflow-hidden">
        {/* Barra Superior do Modo Foco / Popout */}
        <div className="bg-white border-b border-monte-sereno/15 px-4 py-2 flex items-center justify-between shadow-2xs z-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="w-6 h-6 rounded-lg object-cover" />
            <span className="text-xs font-bold text-monte-azul font-display">
              Monteiro Conecta — Modo Foco / WhatsApp
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!isPopout && (
              <button
                type="button"
                onClick={() => setIsFocusMode(false)}
                className="px-3 py-1 bg-monte-sereno/10 hover:bg-monte-sereno/20 text-monte-azul text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Sair do Modo Foco"
              >
                <Minimize2 className="w-3.5 h-3.5" /> Sair do Modo Foco (ESC)
              </button>
            )}
            {isPopout && (
              <button
                type="button"
                onClick={() => window.close()}
                className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Fechar Janela"
              >
                <X className="w-3.5 h-3.5" /> Fechar Janela
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden p-0 lg:p-4">
          <PageErrorBoundary>
            <Outlet
              context={{
                isMobileChatOpen,
                setIsMobileChatOpen,
                isPopout,
                isFocusMode,
                setIsFocusMode,
                togglePopoutWindow,
              }}
            />
          </PageErrorBoundary>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen-safe overflow-hidden bg-monte-areia pt-safe">
      {/* Backdrop overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-monte-azul/50 pt-safe flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-50 sidebar-glass transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'}`}
      >
        <div className="flex flex-col h-full pt-safe pb-safe">
          {/* Logo & Toggle */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/logo.png"
                alt="Monteiro Conecta"
                className="w-10 h-10 rounded-xl object-cover shadow-lg flex-shrink-0"
              />
              {!sidebarCollapsed && (
                <div className="min-w-0">
                  <h1 className="text-lg font-bold font-display text-white leading-tight tracking-tight truncate">
                    Monteiro Conecta
                  </h1>
                  <p className="text-[11px] text-white/40 font-medium truncate">
                    Central de Atendimento
                  </p>
                </div>
              )}
            </div>
            <button
              onClick={closeSidebar}
              className="lg:hidden p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {!sidebarCollapsed && (
              <p className="px-3 mb-2 text-[11px] font-semibold text-white/30 uppercase tracking-widest">
                Menu
              </p>
            )}
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={closeSidebar}
                title={sidebarCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'} ${
                    sidebarCollapsed ? 'justify-center px-0 py-3' : ''
                  }`
                }
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
                {item.showBadge && unreadCount > 0 && (
                  <span className={`bg-monte-terracota text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 leading-none shadow-sm ${sidebarCollapsed ? 'absolute top-1 right-1' : ''}`}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </NavLink>
            ))}

            {!sidebarCollapsed && (
              <p className="px-3 mt-6 mb-2 text-[11px] font-semibold text-white/30 uppercase tracking-widest">
                Gerenciar
              </p>
            )}
            {manageItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeSidebar}
                title={sidebarCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'} ${
                    sidebarCollapsed ? 'justify-center px-0 py-3' : ''
                  }`
                }
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                {!sidebarCollapsed && <span className="flex-1 truncate">{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="px-3 py-4 border-t border-white/10">
            <div className={`flex items-center gap-3 px-2 py-1.5 rounded-full hover:bg-white/10 transition-colors ${sidebarCollapsed ? 'flex-col justify-center' : ''}`}>
              <div className="w-9 h-9 bg-gradient-to-br from-monte-terracota to-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-sm flex-shrink-0">
                {user?.username?.[0].toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{user?.username}</p>
                  <p className="text-[11px] text-white/40 capitalize">{user?.role}</p>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="p-2 rounded-full text-white/40 hover:text-monte-terracota hover:bg-white/10 transition-colors cursor-pointer"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0 transition-all duration-300">
        {/* Top bar */}
        <header className={`bg-white border-b border-monte-sereno/15 px-4 lg:px-6 py-2.5 lg:py-0 lg:h-16 flex items-center gap-3 flex-shrink-0 z-20 ${
          isMobileChatOpen ? 'hidden lg:flex' : 'flex'
        }`}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-full text-monte-azul hover:bg-monte-areiaSecao transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Botão de Recolher/Expandir Menu Lateral no Desktop */}
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className="hidden lg:flex p-2 rounded-full text-monte-azul hover:bg-monte-areiaSecao transition-colors cursor-pointer"
            title={sidebarCollapsed ? 'Expandir Menu Lateral' : 'Recolher Menu Lateral'}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>

          {/* Search */}
          <div className="relative flex-1 max-w-xl">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar contatos, mensagens... (Ctrl+K)"
                className="w-full pl-10 pr-20 py-2.5 bg-monte-areiaSecao/90 hover:bg-white focus:bg-white border border-monte-sereno/20 focus:border-monte-verde/50 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-monte-verde/20 transition-all shadow-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setShowSearch(true)}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {searchLoading ? (
                  <Loader2 className="w-4 h-4 text-monte-verde animate-spin" />
                ) : searchQuery ? (
                  <button
                    onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                    className="p-1 text-monte-sereno hover:text-monte-azul rounded-full hover:bg-monte-areiaSecao transition-colors"
                    title="Limpar busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold text-monte-sereno bg-white/80 border border-monte-sereno/30 rounded-md shadow-2xs">
                    Ctrl K
                  </kbd>
                )}
              </div>
            </div>

            {/* Results Popover / Command Palette */}
            {showSearch && (
              <>
                <div className="fixed inset-0 z-[100] bg-monte-azul/80 pt-safe flex items-center justify-center p-4" onClick={() => setShowSearch(false)} />
                <div className="absolute top-full mt-2 left-0 right-0 sm:-left-8 sm:-right-8 md:-left-16 md:-right-16 bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-monte-sereno/20 z-50 overflow-hidden flex flex-col max-h-[82vh] animate-in fade-in zoom-in-95 duration-150">
                  {/* Category Filter Tabs */}
                  {searchResults && (
                    <div className="flex items-center gap-1 px-4 py-2.5 border-b border-monte-sereno/15 bg-monte-areiaSecao/50 overflow-x-auto">
                      <button
                        onClick={() => setSearchFilter('all')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                          searchFilter === 'all'
                            ? 'bg-monte-verde text-white shadow-xs'
                            : 'text-monte-sereno hover:text-monte-azul hover:bg-white'
                        }`}
                      >
                        Todos ({((searchResults.contacts?.length || 0) + (searchResults.conversations?.length || 0) + (searchResults.messages?.length || 0))})
                      </button>
                      <button
                        onClick={() => setSearchFilter('contacts')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                          searchFilter === 'contacts'
                            ? 'bg-monte-verde text-white shadow-xs'
                            : 'text-monte-sereno hover:text-monte-azul hover:bg-white'
                        }`}
                      >
                        Contatos ({searchResults.contacts?.length || 0})
                      </button>
                      <button
                        onClick={() => setSearchFilter('conversations')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                          searchFilter === 'conversations'
                            ? 'bg-monte-verde text-white shadow-xs'
                            : 'text-monte-sereno hover:text-monte-azul hover:bg-white'
                        }`}
                      >
                        Conversas ({searchResults.conversations?.length || 0})
                      </button>
                      <button
                        onClick={() => setSearchFilter('messages')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                          searchFilter === 'messages'
                            ? 'bg-monte-verde text-white shadow-xs'
                            : 'text-monte-sereno hover:text-monte-azul hover:bg-white'
                        }`}
                      >
                        Mensagens ({searchResults.messages?.length || 0})
                      </button>
                    </div>
                  )}

                  {/* Results Container */}
                  <div className="overflow-y-auto flex-1 p-3 space-y-3">
                    {(!searchQuery || searchQuery.trim().length < 2) && (
                      <div className="py-8 px-4 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-monte-verde/10 text-monte-verde flex items-center justify-center mx-auto mb-3">
                          <Search className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-bold text-monte-azul font-display">Busca Global do Sistema</h4>
                        <p className="text-xs text-monte-sereno max-w-sm mx-auto mt-1">
                          Digite pelo menos 2 caracteres para localizar contatos, conversas e mensagens instantaneamente.
                        </p>
                      </div>
                    )}

                    {searchLoading && (
                      <div className="py-8 text-center text-monte-sereno">
                        <Loader2 className="w-6 h-6 mx-auto animate-spin text-monte-verde mb-2" />
                        <p className="text-xs">Buscando em tempo real...</p>
                      </div>
                    )}

                    {!searchLoading && searchResults && (
                      <>
                        {(searchFilter === 'all' || searchFilter === 'contacts') && searchResults.contacts?.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between px-2 mb-1.5">
                              <span className="text-[11px] font-bold text-monte-sereno uppercase tracking-wider flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5" /> Contatos ({searchResults.contacts.length})
                              </span>
                            </div>
                            <div className="space-y-1">
                              {searchResults.contacts.map((c: any) => (
                                <div
                                  key={c.id}
                                  onClick={() => handleOpenContact(c)}
                                  className="group flex items-center justify-between p-2.5 rounded-2xl hover:bg-monte-areiaSecao cursor-pointer transition-all border border-transparent hover:border-monte-sereno/15"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-monte-verde to-monte-azul text-white font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-2xs">
                                      {(c.name || c.phone)?.[0]?.toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-monte-azul truncate group-hover:text-monte-verde transition-colors">
                                        <HighlightMatch text={c.name || c.phone} query={searchQuery} />
                                      </p>
                                      <p className="text-xs text-monte-sereno truncate flex items-center gap-1.5">
                                        <Phone className="w-3 h-3 flex-shrink-0" />
                                        <HighlightMatch text={c.phone} query={searchQuery} />
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {c.whatsapp?.name && (
                                      <span className="text-[10px] font-medium bg-monte-verde/10 text-monte-verde px-2 py-0.5 rounded-full">
                                        {c.whatsapp.name}
                                      </span>
                                    )}
                                    <span className="text-xs font-semibold text-monte-verde flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      Abrir <ArrowRight className="w-3.5 h-3.5" />
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(searchFilter === 'all' || searchFilter === 'conversations') && searchResults.conversations?.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between px-2 mb-1.5">
                              <span className="text-[11px] font-bold text-monte-sereno uppercase tracking-wider flex items-center gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5" /> Conversas ({searchResults.conversations.length})
                              </span>
                            </div>
                            <div className="space-y-1">
                              {searchResults.conversations.map((c: any) => (
                                <div
                                  key={c.id}
                                  onClick={() => handleOpenConversation(c)}
                                  className="group flex items-center justify-between p-2.5 rounded-2xl hover:bg-monte-areiaSecao cursor-pointer transition-all border border-transparent hover:border-monte-sereno/15"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-monte-sereno/20 text-monte-azul font-bold text-xs flex items-center justify-center flex-shrink-0">
                                      {(c.contact?.name || c.contact?.phone || 'C')?.[0]?.toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-semibold text-monte-azul truncate group-hover:text-monte-verde transition-colors">
                                          <HighlightMatch text={c.contact?.name || c.contact?.phone || 'Conversa'} query={searchQuery} />
                                        </p>
                                        {c.unreadCount > 0 && (
                                          <span className="w-2 h-2 rounded-full bg-monte-terracota" />
                                        )}
                                      </div>
                                      <p className="text-xs text-monte-sereno truncate">
                                        <HighlightMatch text={c.lastMessage || 'Sem mensagens'} query={searchQuery} />
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0 text-right">
                                    {c.whatsapp?.name && (
                                      <span className="text-[10px] font-medium bg-monte-azul/10 text-monte-azul px-2 py-0.5 rounded-full">
                                        {c.whatsapp.name}
                                      </span>
                                    )}
                                    <span className="text-xs font-semibold text-monte-verde flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                      Conversar <ArrowRight className="w-3.5 h-3.5" />
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(searchFilter === 'all' || searchFilter === 'messages') && searchResults.messages?.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between px-2 mb-1.5">
                              <span className="text-[11px] font-bold text-monte-sereno uppercase tracking-wider flex items-center gap-1.5">
                                <Search className="w-3.5 h-3.5" /> Mensagens encontradas ({searchResults.messages.length})
                              </span>
                            </div>
                            <div className="space-y-1">
                              {searchResults.messages.map((m: any) => (
                                <div
                                  key={m.id}
                                  onClick={() => handleOpenMessage(m)}
                                  className="group p-2.5 rounded-2xl hover:bg-monte-areiaSecao cursor-pointer transition-all border border-transparent hover:border-monte-sereno/15"
                                >
                                  <div className="flex items-center justify-between text-xs text-monte-sereno mb-1">
                                    <span className="font-semibold text-monte-azul flex items-center gap-1.5">
                                      <User className="w-3 h-3 text-monte-verde" />
                                      {m.conversation?.contact?.name || m.conversation?.contact?.phone || 'Conversa'}
                                    </span>
                                    <span className="flex items-center gap-1 text-[11px]">
                                      <Clock className="w-3 h-3" />
                                      {new Date(m.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                  <div className="text-xs text-monte-azul/90 bg-white/70 p-2 rounded-xl border border-monte-sereno/10 group-hover:border-monte-verde/30 transition-colors">
                                    <HighlightMatch text={m.content} query={searchQuery} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(!searchResults.contacts?.length && !searchResults.conversations?.length && !searchResults.messages?.length) && (
                          <div className="py-8 text-center text-monte-sereno">
                            <p className="text-sm font-medium text-monte-azul">Nenhum resultado encontrado para "{searchQuery}"</p>
                            <p className="text-xs mt-1 text-monte-sereno/80">Tente buscar por partes do nome, número de telefone ou outras palavras.</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="px-4 py-2 border-t border-monte-sereno/15 bg-monte-areiaSecao/60 flex items-center justify-between text-[11px] text-monte-sereno">
                    <span>Clique em qualquer resultado para abrir diretamente</span>
                    <span className="font-medium">ESC para fechar</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Botões de Ação Avançada do Canvas: Janela Destacada e Modo Foco */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={togglePopoutWindow}
              className="p-2 text-monte-azul/80 hover:text-monte-verde hover:bg-monte-areiaSecao rounded-full transition-colors cursor-pointer"
              title="Abrir WhatsApp em Janela Destacada (Pop-out / Picture in Picture)"
            >
              <ExternalLink className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setIsFocusMode((v) => !v)}
              className="p-2 text-monte-azul/80 hover:text-monte-verde hover:bg-monte-areiaSecao rounded-full transition-colors cursor-pointer"
              title={isFocusMode ? 'Sair do Modo Foco' : 'Modo Foco Total (Destacar Canvas)'}
            >
              {isFocusMode ? <Minimize2 className="w-5 h-5 text-monte-terracota" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>

          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotif(v => !v)}
              className="relative p-2.5 rounded-full text-monte-azul hover:bg-monte-areiaSecao transition-colors"
              title="Notificações"
            >
              <Bell className="w-5 h-5" />
              {(unreadCount + assignedCount) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-monte-terracota text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 leading-none shadow-sm animate-pulse">
                  {(unreadCount + assignedCount) > 99 ? '99+' : unreadCount + assignedCount}
                </span>
              )}
            </button>
            {showNotif && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotif(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-xl rounded-3xl shadow-xl border border-monte-sereno/20 z-50 max-h-96 overflow-y-auto overflow-x-hidden">
                  <div className="px-4 py-3 border-b border-monte-sereno/15 sticky top-0 bg-white/95 backdrop-blur-xl flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold font-display text-monte-azul">Notificações</p>
                      <p className="text-xs text-monte-sereno">
                        {(unreadCount + assignedCount) > 0
                          ? `${unreadCount} mensagem${unreadCount !== 1 ? 's' : ''} não lida${unreadCount !== 1 ? 's' : ''}${assignedCount ? ` · ${assignedCount} demanda${assignedCount !== 1 ? 's' : ''}` : ''}`
                          : 'Tudo em dia'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowNotif(false); navigate('/settings'); }}
                      className="p-1.5 text-monte-verde hover:bg-monte-verde/10 rounded-full transition-colors flex items-center gap-1 text-[11px] font-bold"
                      title="Configurar Notificações Mobile"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Ajustes Mobile</span>
                    </button>
                  </div>
                  {assignedConversations.length > 0 && (
                    <div className="border-b border-monte-sereno/15">
                      <div className="px-4 py-2 bg-monte-verde/5 flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-monte-verde" />
                        <p className="text-xs font-bold text-monte-azul">Demandas para você</p>
                      </div>
                      {assignedConversations.map(conv => (
                        <button
                          key={`assigned-${conv.id}`}
                          onClick={() => openConversation(conv)}
                          className="w-full text-left px-4 py-3 hover:bg-monte-areiaSecao/60 transition-colors flex items-center gap-3 border-b border-monte-sereno/10"
                        >
                          <div className="w-9 h-9 rounded-full bg-monte-verde/15 text-monte-verde flex items-center justify-center flex-shrink-0">
                            <UserCheck className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-monte-azul truncate">
                              {conv.contact?.name || conv.contact?.phone || 'Contato'}
                            </p>
                            <p className="text-[11px] text-monte-verde truncate mt-0.5">
                              Encaminhada para atendimento
                            </p>
                            {conv.whatsapp?.name && (
                              <p className="text-[10px] text-monte-sereno truncate">{conv.whatsapp.name}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {unreadConversations.length === 0 ? (
                    <div className="p-8 text-center">
                      <Bell className="w-8 h-8 mx-auto mb-2 text-monte-sereno/30" />
                      <p className="text-sm text-monte-sereno">Nenhuma notificação</p>
                    </div>
                  ) : (
                    unreadConversations.map(conv => (
                      <button
                        key={conv.id}
                        onClick={() => openConversation(conv)}
                        className="w-full text-left px-4 py-3 hover:bg-monte-areiaSecao/60 transition-colors flex items-center gap-3 border-b border-monte-sereno/10"
                      >
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-monte-verde to-monte-azul text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {(conv.contact?.name || conv.contact?.phone || '?')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-monte-azul truncate">
                              {conv.contact?.name || conv.contact?.phone}
                            </p>
                            <span className="bg-monte-terracota text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold flex-shrink-0">
                              {conv.unreadCount}
                            </span>
                          </div>
                          <p className="text-xs text-monte-sereno truncate mt-0.5">
                            {conv.lastMessage || 'Nova mensagem'}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main
          ref={mainRef}
          className={`flex-1 overflow-y-auto ${
            location.pathname.startsWith('/conversations')
              ? 'p-0 lg:p-6'
              : 'p-4 lg:p-6 pb-24 lg:pb-6'
          }`}
          onClick={() => { setShowSearch(false); }}
        >
          <PageErrorBoundary>
            <Outlet
              context={{
                isMobileChatOpen,
                setIsMobileChatOpen,
                isPopout,
                isFocusMode,
                setIsFocusMode,
                togglePopoutWindow,
                sidebarCollapsed,
                toggleSidebarCollapsed,
              }}
            />
          </PageErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {!isMobileChatOpen && (
        <nav
          aria-label="Navegação móvel inferior"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-monte-sereno/15 pb-safe pt-2 px-1 flex items-center justify-around shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
        >
          <NavLink
            to="/conversations"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-3 min-w-[62px] rounded-2xl transition-all ${
                isActive ? 'text-monte-verde font-bold scale-105' : 'text-monte-sereno hover:text-monte-azul'
              }`
            }
          >
            <div className="relative">
              <MessageSquare className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 bg-monte-terracota text-white text-[9px] font-bold rounded-full min-w-[17px] h-4 flex items-center justify-center px-1 shadow-xs">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1 tracking-tight">Conversas</span>
          </NavLink>

          <NavLink
            to="/whatsapp"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-3 min-w-[62px] rounded-2xl transition-all ${
                isActive ? 'text-monte-verde font-bold scale-105' : 'text-monte-sereno hover:text-monte-azul'
              }`
            }
          >
            <Smartphone className="w-5 h-5" />
            <span className="text-[10px] mt-1 tracking-tight">Whatsapps</span>
          </NavLink>

          <NavLink
            to="/contacts"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-3 min-w-[62px] rounded-2xl transition-all ${
                isActive ? 'text-monte-verde font-bold scale-105' : 'text-monte-sereno hover:text-monte-azul'
              }`
            }
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] mt-1 tracking-tight">Contatos</span>
          </NavLink>

          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-1 px-3 min-w-[62px] rounded-2xl transition-all ${
                isActive ? 'text-monte-verde font-bold scale-105' : 'text-monte-sereno hover:text-monte-azul'
              }`
            }
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] mt-1 tracking-tight">Painel</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}
