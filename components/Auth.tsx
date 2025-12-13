
import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Truck, LogIn, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';

interface AuthProps {
  onSession: (session: any) => void;
}

const Auth: React.FC<AuthProps> = ({ onSession }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onSession(data.session);
      } else {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { full_name: email.split('@')[0] } }
        });
        if (error) throw error;
        if (data.session) onSession(data.session);
        else setError("Verifique seu e-mail para confirmar o cadastro!");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500 rounded-full blur-[120px]"></div>
      </div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden relative z-10">
        <div className="p-8">
          <div className="flex flex-col items-center mb-10">
            <div className="p-4 bg-amber-500 rounded-2xl shadow-lg shadow-amber-500/20 mb-4">
              <Truck className="text-slate-900 w-10 h-10" />
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">Arga Router</h1>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-widest mt-1">Logística Inteligente</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-400 text-sm">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">E-mail Corporativo</label>
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 text-slate-500 w-4 h-4" />
                <input 
                  type="email" 
                  placeholder="seu@email.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-3.5 text-slate-500 w-4 h-4" />
                <input 
                  type="password" 
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3.5 pl-12 pr-4 text-white placeholder-slate-600 focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button 
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-slate-950 font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-amber-500/10 active:scale-[0.98] mt-6"
            >
              {loading ? <Loader2 className="animate-spin" /> : <LogIn size={20} />}
              {mode === 'login' ? 'ENTRAR NO SISTEMA' : 'CRIAR CONTA'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <button 
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-slate-500 hover:text-white text-xs font-bold transition-colors"
            >
              {mode === 'login' ? 'Não tem acesso? Solicite cadastro' : 'Já possui conta? Voltar ao login'}
            </button>
          </div>
        </div>
        
        <div className="bg-slate-950/50 p-4 text-center border-t border-slate-800">
            <p className="text-[10px] text-slate-600 font-medium">© 2025 ARGA ROUTER PRO • v2.1.0</p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
