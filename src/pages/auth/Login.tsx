import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, GraduationCap, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiForgotPassword } from '../../lib/api';
import type { ApiUserRole } from '../../lib/types';

type View = 'login' | 'signup' | 'reset';

function dashboardPathForRole(role: ApiUserRole): string {
  switch (role) {
    case 'admin':
    case 'batch_manager':
      return '/admin/dashboard';
    case 'mentor':
    case 'external_mentor':
      return '/mentor/dashboard';
    case 'student':
      return '/student/dashboard';
  }
}

const signupRoles: { value: ApiUserRole; label: string; icon: typeof Shield }[] = [
  { value: 'admin', label: 'Admin', icon: Shield },
  { value: 'mentor', label: 'Mentor', icon: GraduationCap },
  { value: 'student', label: 'Student', icon: User },
];

export default function Login() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<View>('login');
  const [signupRole, setSignupRole] = useState<ApiUserRole>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Once authenticated (fresh login, or an existing session was restored), send
  // the user straight to the dashboard that matches their role.
  useEffect(() => {
    if (user) {
      navigate(dashboardPathForRole(user.role), { replace: true });
    }
  }, [user, navigate]);

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
        await signup(email, password, name.trim(), signupRole);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Sign up failed.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ── Sign In ── credentials alone decide where the user lands; the
    // backend's returned role drives the redirect in the effect above.
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = () => {
    console.log('Google sign in');
  };

  const headings = {
    login:  { title: 'Sign in',        sub: 'OJT Management' },
    signup: { title: 'Create account', sub: 'OJT Management' },
    reset:  { title: 'Reset password', sub: "We'll send you a link" },
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">
            OJT <span className="text-gold">Management</span>
          </h1>
          <p className="text-gray-500 text-sm">{headings[view].sub}</p>
        </div>

        <div className="bg-[#141414] border border-[#2a2a2a] rounded-2xl w-full">
          <div className="px-6 pt-5 pb-4 border-b border-[#2a2a2a]">
            <p className="text-white font-bold text-base">{headings[view].title}</p>
          </div>

          <div className="px-6 py-5 space-y-3">

            {/* ── LOGIN VIEW ── */}
            {view === 'login' && (
              <>
                <button
                  onClick={handleGoogle}
                  className="w-full flex items-center justify-center gap-2.5 py-2 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-gray-500 rounded-lg text-white text-xs font-medium transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.6-8 19.6-20 0-1.3-.1-2.7-.4-4z"/>
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.6 4.8C9.8 39.8 16.4 44 24 44z"/>
                    <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.2 5.2C40.4 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/>
                  </svg>
                  Continue with Google
                </button>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-[#2a2a2a]" />
                  <span className="text-gray-600 text-xs">or</span>
                  <div className="flex-1 h-px bg-[#2a2a2a]" />
                </div>

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
                    Sign in
                  </button>
                </form>

                {/* Quick Login Accounts */}
                <div className="pt-3 border-t border-[#2a2a2a] space-y-1.5">
                  <p className="text-[#8a8a8a] text-[10px] uppercase font-bold tracking-wider">Quick Select Demo Logins</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setEmail('admin@ojt.edu'); setPassword('password'); }}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-[10px] text-gray-300 rounded font-medium transition-colors"
                    >
                      Admin
                    </button>
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
                      Donda Vishal (Mentor)
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEmail('student1@ojt.edu'); setPassword('password'); }}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-750 text-[10px] text-gray-300 rounded font-medium transition-colors"
                    >
                      Alice Johnson (Student)
                    </button>
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
                    <label className="block text-gray-400 text-xs mb-1">I am a</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {signupRoles.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setSignupRole(value)}
                          className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[11px] font-medium transition-colors ${
                            signupRole === value
                              ? 'bg-gold/10 border-gold/40 text-gold'
                              : 'bg-[#1a1a1a] border-[#2a2a2a] text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          <Icon size={16} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

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

                  {error && <p className="text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg">{error}</p>}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors text-xs flex items-center justify-center gap-2"
                  >
                    {submitting && <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                    Create account
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
    </div>
  );
}
