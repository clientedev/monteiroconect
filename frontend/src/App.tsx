import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import WhatsAppPage from './pages/WhatsAppPage';
import ConversationsPage from './pages/ConversationsPage';
import ContactsPage from './pages/ContactsPage';
import AttendantsPage from './pages/AttendantsPage';
import TagsPage from './pages/TagsPage';
import LogsPage from './pages/LogsPage';
import SettingsPage from './pages/SettingsPage';
import ChatbotsPage from './pages/ChatbotsPage';
import { useEffect } from 'react';
import { connectSocket, disconnectSocket } from './lib/socket';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-brand-600 border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  const { token, user } = useAuth();

  useEffect(() => {
    if (token && user) {
      connectSocket(token);
    }
    return () => disconnectSocket();
  }, [token, user]);

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
        <Route path="chatbots" element={<ChatbotsPage />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="attendants" element={<AttendantsPage />} />
        <Route path="tags" element={<TagsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
