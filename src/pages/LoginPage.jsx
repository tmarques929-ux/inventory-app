import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import loginBackground from '../assets/wlt-logo-mark.svg';
import { useNotifications } from '../context/NotificationContext';

const initialFeedback = { type: '', text: '' };

const feedbackStyles = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
};

const AUTH_ERROR_FALLBACK =
  'N\u00E3o foi poss\u00EDvel concluir a opera\u00E7\u00E3o.';
const MAGIC_LINK_SUCCESS =
  'Enviamos um link m\u00E1gico para seu e-mail. Confira sua caixa de entrada.';
const MAGIC_LINK_ERROR_FALLBACK = 'N\u00E3o foi poss\u00EDvel enviar o link m\u00E1gico.';
const CONNECTION_SUCCESS = 'Conex\u00E3o com Supabase estabelecida com sucesso.';
const CONNECTION_ERROR_PREFIX = 'Erro ao testar conex\u00E3o: ';
const showConnectionPing = import.meta.env.DEV;

export default function LoginPage() {
  const { signInWithEmail, signUpWithEmail, signInWithMagicLink, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(initialFeedback);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setFeedback(initialFeedback);

    try {
      if (isRegister) {
        const { error } = await signUpWithEmail(email, password);
        if (error) throw error;
        setFeedback({
          type: 'success',
          text: 'Conta criada! Verifique seu e-mail para confirmar o cadastro.',
        });
      } else {
        const { error } = await signInWithEmail(email, password);
        if (error) throw error;
        setFeedback({ type: 'success', text: 'Autenticado com sucesso!' });
        navigate('/');
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || AUTH_ERROR_FALLBACK,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async () => {
    setLoading(true);
    setFeedback(initialFeedback);
    try {
      const { error } = await signInWithMagicLink(email);
      if (error) throw error;
      setFeedback({
        type: 'success',
        text: MAGIC_LINK_SUCCESS,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err.message || MAGIC_LINK_ERROR_FALLBACK,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 bg-contain bg-center bg-no-repeat opacity-10"
        style={{ backgroundImage: `url(${loginBackground})` }}
        aria-hidden
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/85 to-slate-950/95"
        aria-hidden
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/95 shadow-2xl backdrop-blur">
          <div className="space-y-6 p-8">
            <header className="space-y-2 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
                WLT Automa\u00E7\u00E3o
              </p>
              <h1 className="text-3xl font-bold text-slate-900">
                {isRegister ? 'Criar conta' : 'Acessar painel'}
              </h1>
              <p className="text-sm text-slate-500">
                Utilize suas credenciais corporativas para acessar o controle de estoque.
              </p>
            </header>

            {feedback.text && (
              <p
                className={`rounded-xl border px-4 py-3 text-sm transition ${feedbackStyles[feedback.type]}`}
              >
                {feedback.text}
              </p>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-600">
                E-mail corporativo
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  className="rounded-xl border border-slate-200 px-4 py-3 text-base font-normal text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="voce@empresa.com"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm font-medium text-slate-600">
                Senha
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  className="rounded-xl border border-slate-200 px-4 py-3 text-base font-normal text-slate-900 shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  placeholder="********"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-sky-600 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:bg-sky-400"
              >
                {loading ? 'Processando...' : isRegister ? 'Criar conta' : 'Entrar'}
              </button>
            </form>

            {!isRegister && (
              <button
                type="button"
                onClick={handleMagicLink}
                disabled={loading || !email}
                className="w-full rounded-xl border border-sky-200 px-6 py-3 text-sm font-semibold text-sky-600 transition hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                Enviar link m\u00E1gico por e-mail
              </button>
            )}

            <div className="flex flex-col gap-4 text-center text-sm text-slate-500">
              <button
                type="button"
                onClick={() => {
                  setIsRegister((current) => !current);
                  setFeedback(initialFeedback);
                }}
                className="font-semibold text-sky-600 transition hover:text-sky-700"
              >
                {isRegister ? 'J\u00E1 possui conta? Entrar' : 'Ainda n\u00E3o tem acesso? Criar conta'}
              </button>
              {showConnectionPing && <ConnectionPingButton disabled={loading} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectionPingButton({ disabled }) {
  const { notifySuccess, notifyError } = useNotifications();

  const handlePing = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        notifyError(`${CONNECTION_ERROR_PREFIX}${error.message}`);
      } else {
        console.log('PING getSession =>', { data, error });
        notifySuccess(CONNECTION_SUCCESS);
      }
    } catch (err) {
      notifyError(`Falha de rede: ${err.message}`);
    }
  };

  return (
    <button
      type="button"
      onClick={handlePing}
      disabled={disabled}
      className="text-xs font-medium text-slate-400 underline-offset-4 transition hover:text-slate-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-300"
    >
      Testar conex\u00E3o com Supabase
    </button>
  );
}


