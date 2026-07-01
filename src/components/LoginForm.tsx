import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiForgotPassword } from '../lib/api';
import type { ApiUserRole } from '../lib/types';

type Role = 'admin' | 'mentor' | 'student';
type View = 'login' | 'signup' | 'reset';

const config: Record<Role, { title: string; sub: string; apiRole: ApiUserRole; allowedRoles: ApiUserRole[] }> = {
  admin:   { title: 'Admin',   sub: 'Full system access',  apiRole: 'admin',   allowedRoles: ['admin', 'batch_manager'] },
  mentor:  { title: 'Mentor',  sub: 'Supervisor access',   apiRole: 'mentor',  allowedRoles: ['mentor', 'external_mentor'] },
  student: { title: 'Student', sub: 'Track your progress', apiRole: 'student', allowedRoles: ['student'] },
};

interface Props {
  role: Role;
  onClose: () => void;
}

export default function LoginModal({ role, onClose }: Props) {
  const { login, signup } = useAuth();
  const [view, setView] = useState<View>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const cfg = config[role];

  const resetForm = () => {
    setName(''); setEmail(''); setPassword(''); setConfirmPassword('');
    setError(null); setResetSent(false);
  };

  const switchView = (v: View) => { resetForm(); setView(v); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // ── Forgot Password ──
    if (view === 'reset') {
      if (!email) { setError('Please enter your email.'); return; }
      setSubmitting(true);
      try {
        await apiForgotPassword(email);
        setResetSent(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to send reset email.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!email || !password) { setError('Please fill in all fields.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    // ── Sign Up ──
    if (view === 'signup') {
      if (!name.trim()) { setError('Please enter your name.'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
      setSubmitting(true);
      try {
        await signup(email, password, name.trim(), cfg.apiRole, cfg.allowedRoles);
        // Auth context will update user → App.tsx will auto-route
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Sign up failed.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ── Sign In ──
    setSubmitting(true);
    try {
      await login(email, password, cfg.allowedRoles);
      // Auth context will update user → App.tsx will auto-route
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const headings = {
    login:  { title: 'Sign in',         sub: `${cfg.title} · ${cfg.sub}` },
    signup: { title: 'Create account',  sub: `${cfg.title} · ${cfg.sub}` },
    reset:  { title: 'Reset password',  sub: "We'll send you a link"     },
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-[#2a2a2a]">
          <div>
            <p className="text-white font-bold text-base">{headings[view].title}</p>
            <p className="text-gray-500 text-xs mt-0.5">{headings[view].sub}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white hover:bg-[#2a2a2a] rounded-lg w-7 h-7 flex items-center justify-center transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">

          {/* ── LOGIN VIEW ── */}
          {view === 'login' && (
            <>
              <form onSubmit={handleSubmit} className="space-y-2.5">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Email address</label>
                  <input
                    type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Password</label>
                  <input
                    type="password" required value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                  />
                </div>

                {error && <p className="text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors text-xs flex items-center justify-center gap-2"
                >
                  {submitting && <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                  Sign in as {cfg.title}
                </button>
              </form>

              {/* Quick Login Accounts */}
              <div className="pt-3 border-t border-[#2a2a2a] space-y-1.5">
                <p className="text-[#8a8a8a] text-[10px] uppercase font-bold tracking-wider">Quick Select Demo Logins</p>
                <div className="flex flex-wrap gap-1.5">
                  {role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => { setEmail('admin@ojt.edu'); setPassword('password'); }}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-[10px] text-gray-300 rounded font-medium transition-colors"
                    >
                      Admin
                    </button>
                  )}
                  {role === 'mentor' && (
                    <>
                      <button
                        type="button"
                        onClick={() => { setEmail('rohit.gupta@ojt.edu'); setPassword('password'); }}
                        className="px-2 py-1 bg-gold/10 hover:bg-gold/20 text-[10px] text-gold rounded font-bold border border-gold/20 transition-all duration-200"
                      >
                        Rohit Gupta (Mentor)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEmail('vishal.donda@ojt.edu'); setPassword('password'); }}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-[10px] text-gray-300 rounded font-medium transition-colors"
                      >
                        Donda Vishal
                      </button>
                    </>
                  )}
                  {role === 'student' && (
                    <button
                      type="button"
                      onClick={() => { setEmail('student1@ojt.edu'); setPassword('password'); }}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-[10px] text-gray-300 rounded font-medium transition-colors"
                    >
                      Alice Johnson (student1)
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => switchView('reset')}
                  className="text-xs text-gray-500 hover:text-yellow-400 transition-colors"
                >
                  Forgot password?
                </button>
                <button
                  onClick={() => switchView('signup')}
                  className="text-xs text-gray-500 hover:text-yellow-400 transition-colors"
                >
                  Create account
                </button>
              </div>
            </>
          )}

          {/* ── SIGNUP VIEW ── */}
          {view === 'signup' && (
            <>
              <form onSubmit={handleSubmit} className="space-y-2.5">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Full name</label>
                  <input
                    type="text" required value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Email address</label>
                  <input
                    type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Password</label>
                  <input
                    type="password" required value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Confirm password</label>
                  <input
                    type="password" required value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                  />
                </div>

                <p className="text-gray-600 text-xs">
                  You will be registered as: <span className="text-yellow-400 font-medium">{cfg.title}</span>
                </p>

                {error && <p className="text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors text-xs flex items-center justify-center gap-2"
                >
                  {submitting && <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                  Create {cfg.title} Account
                </button>
              </form>

              <div className="flex justify-center pt-1">
                <button
                  onClick={() => switchView('login')}
                  className="text-xs text-gray-500 hover:text-yellow-400 transition-colors"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </>
          )}

          {/* ── RESET VIEW ── */}
          {view === 'reset' && (
            <>
              {resetSent ? (
                <div className="py-3 text-center space-y-2">
                  <div className="w-10 h-10 bg-yellow-950 rounded-full flex items-center justify-center mx-auto text-lg">
                    ✉️
                  </div>
                  <p className="text-white text-sm font-semibold">Check your email</p>
                  <p className="text-gray-500 text-xs leading-relaxed">
                    We sent a password reset link to <span className="text-yellow-400">{email}</span>
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-2.5">
                  <p className="text-gray-500 text-xs leading-relaxed">
                    Enter your email and we'll send you a link to reset your password.
                  </p>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Email address</label>
                    <input
                      type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                    />
                  </div>

                  {error && <p className="text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors text-xs flex items-center justify-center gap-2"
                  >
                    {submitting && <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                    Send reset link
                  </button>
                </form>
              )}

              <div className="flex justify-center pt-1">
                <button
                  onClick={() => switchView('login')}
                  className="text-xs text-gray-500 hover:text-yellow-400 transition-colors"
                >
                  ← Back to sign in
                </button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
