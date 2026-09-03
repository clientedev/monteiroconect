import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api, authApi } from '../lib/api';

interface User {
  id: string;
  username: string;
  email?: string;
  role: string;
  mustChangePassword?: boolean;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
  reloadUser: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadUser = async () => {
    try {
      const u = await authApi.me();
      setUser(u as User);
    } catch {
      localStorage.removeItem('wa_token');
      api.setToken(null);
      setUser(null);
      setToken(null);
    }
  };

  useEffect(() => {
    api.loadToken();
    const savedToken = localStorage.getItem('wa_token');
    if (savedToken) {
      setToken(savedToken);
      authApi.me()
        .then((u: any) => setUser(u as User))
        .catch(() => {
          localStorage.removeItem('wa_token');
          api.setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    const t = res.token;
    setToken(t);
    api.setToken(t);
    setUser(res.user);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    api.setToken(null);
  };

  const updateUser = (partial: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...partial } : null));
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateUser, reloadUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
