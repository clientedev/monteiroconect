import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../lib/api';
import { Lock, Eye, EyeOff, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function ForceChangePasswordModal() {
  const { user, updateUser } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  if (!user?.mustChangePassword) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await authApi.changePassword(newPassword);
      setSuccess('Senha alterada com sucesso!');
      setTimeout(() => {
        updateUser({ mustChangePassword: false });
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Erro ao alterar senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-monte-azul/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl sm:rounded-4xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-white/20 relative animate-in fade-in zoom-in duration-200">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h3 className="text-2xl font-bold font-display text-monte-azul">
            Troca de Senha Obrigatória
          </h3>
          <p className="text-xs sm:text-sm text-monte-sereno mt-2">
            Olá, <strong className="text-monte-azul">{user.username}</strong>! Este é seu primeiro acesso (ou sua senha foi resetada). Por motivos de segurança, você deve definir uma nova senha para continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-600 px-4 py-3 rounded-2xl text-xs sm:text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-4 py-3 rounded-2xl text-xs sm:text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-monte-azul uppercase tracking-wider mb-1.5">
              Nova Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="input pr-10 text-sm"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-monte-sereno hover:text-monte-azul transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-monte-azul uppercase tracking-wider mb-1.5">
              Confirmar Nova Senha
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              className="input text-sm"
              placeholder="Digite a nova senha novamente"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !newPassword || !confirmPassword}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-sm font-semibold shadow-lg shadow-monte-verde/20 mt-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Salvar Nova Senha
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
