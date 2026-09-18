import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { NotificationProvider } from './context/NotificationContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WhatsAppPage from './pages/WhatsAppPage';
import ConversationsPage from './pages/ConversationsPage';
import BroadcastPage from './pages/BroadcastPage';
import ContactsPage from './pages/ContactsPage';
import AttendantsPage from './pages/AttendantsPage';
import TagsPage from './pages/TagsPage';
import ChatbotsPage from './pages/ChatbotsPage';
import SettingsPage from './pages/SettingsPage';
import QuickMessagesPage from './pages/QuickMessagesPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-monte-verde border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/login" />;
  return (
    <SocketProvider>
      <NotificationProvider>
        {children}
      </NotificationProvider>
    </SocketProvider>
  );
}

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to="/" /> : <LoginPage />
      } />
      <Route path="/" element={
        <PrivateRoute><Layout /></PrivateRoute>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="broadcast" element={<BroadcastPage />} />
        <Route path="chatbots" element={<ChatbotsPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="attendants" element={<AttendantsPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="mensagem" element={<QuickMessagesPage />} />
        <Route path="quick-messages" element={<Navigate to="/mensagem" replace />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

