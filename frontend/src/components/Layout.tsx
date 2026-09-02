import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { disconnectSocket } from '../lib/socket';
import {
  LayoutDashboard, MessageSquare, Smartphone, Users, Tags, Bell, Megaphone,
  LogOut, Search, Menu, X, Bot,
} from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { dashboardApi } from '../lib/api';

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
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadConversations, setUnreadConversations] = useState<any[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

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
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setShowSearch(false);
        setShowNotif(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const loadUnreadCount = useCallback(async () => {
    try {
      const stats = await dashboardApi.stats();
      setUnreadCount(stats.unreadMessages || 0);
      setUnreadConversations(stats.unreadConversations || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 15000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  // Atualiza badge em tempo real: nova mensagem OU conversa lida
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    try {
      const { searchApi } = await import('../lib/api');
      const res = await searchApi.search(searchQuery);
      setSearchResults(res);
    } catch {}
  };

  const openConversation = (conv: any) => {
    setShowNotif(false);
    navigate('/conversations', {
      state: { conversationId: conv.id, accountId: conv.whatsapp?.id },
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-monte-areia">
      {/* Backdrop overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-monte-azul/30 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-40 w-72 sidebar-glass transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Monteiro Conecta"
                className="w-10 h-10 rounded-xl object-cover shadow-lg"
              />
              <div>
                <h1 className="text-lg font-bold font-display text-white leading-tight tracking-tight">
                  Monteiro Conecta
                </h1>
                <p className="text-[11px] text-white/40 font-medium">
                  Central de Atendimento
                </p>
              </div>
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
            <p className="px-3 mb-2 text-[11px] font-semibold text-white/30 uppercase tracking-widest">
              Menu
            </p>
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
                }
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.showBadge && unreadCount > 0 && (
                  <span className="bg-monte-terracota text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 leading-none shadow-sm">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </NavLink>
            ))}

            <p className="px-3 mt-6 mb-2 text-[11px] font-semibold text-white/30 uppercase tracking-widest">
              Gerenciar
            </p>
            {manageItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `sidebar-link ${isActive ? 'sidebar-link-active' : 'sidebar-link-inactive'}`
                }
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="px-3 py-4 border-t border-white/10">
            <div className="flex items-center gap-3 px-2 py-1.5 rounded-full hover:bg-white/10 transition-colors">
              <div className="w-9 h-9 bg-gradient-to-br from-monte-terracota to-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-sm">
                {user?.username?.[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.username}</p>
                <p className="text-[11px] text-white/40 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 rounded-full text-white/40 hover:text-monte-terracota hover:bg-white/10 transition-colors"
                title="Sair"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="bg-white/70 backdrop-blur-md border-b border-monte-sereno/20 px-4 lg:px-6 h-16 flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-full text-monte-azul hover:bg-monte-areiaSecao transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <div className="relative flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-monte-sereno" />
              <input
                type="text"
                placeholder="Buscar contatos, mensagens..."
                className="w-full pl-10 pr-4 py-2.5 bg-monte-areiaSecao/80 border border-monte-sereno/20 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-monte-verde/30 focus:bg-white transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                onFocus={() => setShowSearch(true)}
              />
            </div>
            {showSearch && searchResults && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSearch(false)} />
                <div className="absolute top-full mt-2 w-full bg-white/90 backdrop-blur-xl rounded-3xl shadow-xl border border-monte-sereno/20 z-50 max-h-96 overflow-y-auto p-2">
                  {searchResults.contacts?.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-monte-sereno uppercase tracking-wider px-3 mb-1">Contatos</p>
                      {searchResults.contacts.map((c: any) => (
                        <div key={c.id} className="px-3 py-2.5 hover:bg-monte-areiaSecao rounded-2xl cursor-pointer text-sm transition-colors">
                          <p className="font-medium text-monte-azul">{c.name || c.phone}</p>
                          <p className="text-xs text-monte-sereno">{c.phone}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.conversations?.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-monte-sereno uppercase tracking-wider px-3 mb-1">Conversas</p>
                      {searchResults.conversations.slice(0, 5).map((c: any) => (
                        <div
                          key={c.id}
                          className="px-3 py-2.5 hover:bg-monte-areiaSecao rounded-2xl cursor-pointer text-sm transition-colors"
                          onClick={() => { navigate('/conversations'); setShowSearch(false); }}
                        >
                          <p className="font-medium text-monte-azul">{c.contact?.name || c.contact?.phone}</p>
                          <p className="text-xs text-monte-sereno truncate">{c.lastMessage}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {(!searchResults?.contacts?.length && !searchResults?.conversations?.length) && (
                    <p className="p-6 text-sm text-monte-sereno text-center">Nenhum resultado encontrado</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Notification bell */}
          <div className="relative ml-auto">
            <button
              onClick={() => setShowNotif(v => !v)}
              className="relative p-2.5 rounded-full text-monte-azul hover:bg-monte-areiaSecao transition-colors"
              title="Notificações"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-monte-terracota text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 leading-none shadow-sm animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {showNotif && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotif(false)} />
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-xl rounded-3xl shadow-xl border border-monte-sereno/20 z-50 max-h-96 overflow-y-auto overflow-x-hidden">
                  <div className="px-4 py-3 border-b border-monte-sereno/15 sticky top-0 bg-white/95 backdrop-blur-xl">
                    <p className="text-sm font-bold font-display text-monte-azul">Notificações</p>
                    <p className="text-xs text-monte-sereno">
                      {unreadCount > 0 ? `${unreadCount} mensagem${unreadCount > 1 ? 's' : ''} não lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}
                    </p>
                  </div>
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
        <main className="flex-1 overflow-y-auto p-4 lg:p-6" onClick={() => { setShowSearch(false); }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
