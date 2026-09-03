import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Eye, EyeOff, Zap } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState(() => localStorage.getItem('remembered_username') || '');
  const [password, setPassword] = useState(() => localStorage.getItem('remembered_password') || '');
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('remember_me') === 'true');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (rememberMe) {
      localStorage.setItem('remember_me', 'true');
      localStorage.setItem('remembered_username', username);
      localStorage.setItem('remembered_password', password);
    } else {
      localStorage.removeItem('remember_me');
      localStorage.removeItem('remembered_username');
      localStorage.removeItem('remembered_password');
    }

    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-monte-verde via-monte-azul to-monte-verde">
      <div className="w-full max-w-md px-4">
        <div className="bg-white/20 backdrop-blur-xl rounded-4xl p-8 shadow-2xl border border-white/30">
          <div className="text-center mb-8">
            <img
              src="/logo.png"
              alt="Monteiro Conecta"
              className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-lg object-cover"
            />
            <h1 className="text-3xl font-bold font-display text-white tracking-tight">
              Monteiro Conecta
            </h1>
            <p className="text-white/50 mt-2 text-sm">
              Central de Atendimento Inteligente
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/30 text-red-100 px-4 py-3 rounded-2xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">Usuário</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:bg-white/20 transition-all"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Digite seu usuário"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-4 pr-10 py-3 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:bg-white/20 transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-white/70 hover:text-white transition-colors select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-white/30 bg-white/15 text-monte-verde focus:ring-0 focus:ring-offset-0 cursor-pointer accent-monte-verde"
                />
                <span>Lembrar senha</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white hover:bg-white/90 text-monte-verde font-bold py-3 px-6 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2 text-sm"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-monte-verde/30 border-t-monte-verde rounded-full animate-spin" />
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Entrar
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
