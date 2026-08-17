import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { disconnectSocket, getSocket } from '../lib/socket';
import {
  LayoutDashboard, MessageSquare, Smartphone, Users, Tags,
  ScrollText, Settings, LogOut, Search, Menu, X, Bot,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { dashboardApi } from '../lib/api';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/whatsapp', icon: Smartphone, label: 'WhatsApps' },
  { to: '/conversations', icon: MessageSquare, label: 'Conversas', showBadge: true },
  { to: '/chatbots', icon: Bot, label: 'Chatbots' },
  { to: '/contacts', icon: Users, label: 'Contatos' },
  { to: '/attendants', icon: Users, label: 'Atendentes' },
  { to: '/tags', icon: Tags, label: 'Etiquetas' },
  { to: '/logs', icon: ScrollText, label: 'Logs' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close sidebar on route change or outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sidebarOpen]);

  // Close sidebar on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
        setShowSearch(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Carregar contagem de não lidas
  const loadUnreadCount = async () => {
    try {
      const stats = await dashboardApi.stats();
      setUnreadCount(stats.unreadMessages || 0);
    } catch {}
  };

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 15000);
    return () => clearInterval(interval);
  }, []);

  // Atualizar badge em tempo real via socket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onNew = () => { loadUnreadCount(); };
    socket.on('message:new', onNew);
    return () => { socket.off('message:new', onNew); };
  }, []);

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

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Backdrop overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity duration-300"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-gray-200 shadow-lg lg:shadow-none transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-md">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 leading-tight">Monteiro Conecta</h1>
                <p className="text-[11px] text-gray-400 font-medium">Central de Atendimento</p>
              </div>
            </div>
            <button
              onClick={closeSidebar}
              className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <p className="px-3 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Menu</p>
            {navItems.slice(0, 4).map(item => (
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
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </NavLink>
            ))}

            <p className="px-3 mt-6 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Gerenciar</p>
            {navItems.slice(4).map(item => (
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
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="px-3 py-3 border-t border-gray-100">
            <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 bg-gradient-to-br from-brand-400 to-brand-600 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-sm">
                {user?.username?.[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user?.username}</p>
                <p className="text-[11px] text-gray-400 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 h-14 flex items-center gap-4 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Search */}
          <div className="relative flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar contatos, mensagens..."
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:bg-white transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                onFocus={() => setShowSearch(true)}
              />
            </div>
            {showSearch && searchResults && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSearch(false)} />
                <div className="absolute top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
                  {searchResults.contacts?.length > 0 && (
                    <div className="p-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase px-2 mb-1">Contatos</p>
                      {searchResults.contacts.map((c: any) => (
                        <div key={c.id} className="px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer text-sm transition-colors">
                          <p className="font-medium text-gray-900">{c.name || c.phone}</p>
                          <p className="text-xs text-gray-500">{c.phone}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchResults.conversations?.length > 0 && (
                    <div className="p-2">
                      <p className="text-xs font-semibold text-gray-400 uppercase px-2 mb-1">Conversas</p>
                      {searchResults.conversations.slice(0, 5).map((c: any) => (
                        <div
                          key={c.id}
                          className="px-3 py-2 hover:bg-gray-50 rounded-lg cursor-pointer text-sm transition-colors"
                          onClick={() => { navigate('/conversations'); setShowSearch(false); }}
                        >
                          <p className="font-medium text-gray-900">{c.contact?.name || c.contact?.phone}</p>
                          <p className="text-xs text-gray-500 truncate">{c.lastMessage}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {(!searchResults?.contacts?.length && !searchResults?.conversations?.length) && (
                    <p className="p-4 text-sm text-gray-500 text-center">Nenhum resultado encontrado</p>
                  )}
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6" onClick={() => setShowSearch(false)}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
