import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, GraduationCap, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiForgotPassword } from '../../lib/api';
import type { ApiUserRole } from '../../lib/types';
import { useToast } from '../../toast';

type View = 'login' | 'signup' | 'reset';

function dashboardPathForRole(role: ApiUserRole): string {
  const normRole = (role || '').toLowerCase();
  switch (normRole) {
    case 'admin':
    case 'batch_manager':
      return '/admin/dashboard';
    case 'mentor':
    case 'external_mentor':
      return '/mentor/dashboard';
    case 'student':
    default:
      return '/student/dashboard';
  }
}

const signupRoles: { value: ApiUserRole; label: string; icon: typeof Shield }[] = [
  { value: 'admin', label: 'Admin', icon: Shield },
  { value: 'mentor', label: 'Mentor', icon: GraduationCap },
  { value: 'student', label: 'Student', icon: User },
];

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  show: boolean;
  onToggle: () => void;
}

function PasswordField({ label, value, onChange, placeholder, show, onToggle }: PasswordFieldProps) {
  return (
    <div>
      <label className="block text-gray-400 text-xs mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'} required value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-login-surface border border-login-border focus:border-yellow-500 rounded-lg px-3 py-2 pr-9 text-white text-xs outline-none transition-colors placeholder-gray-600"
        />
        <button
          type="button"
          onClick={onToggle}
          tabIndex={-1}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

export default function Login() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const { showError } = useToast();

  const [view, setView] = useState<View>('login');
  const [signupRole, setSignupRole] = useState<ApiUserRole>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
    setShowPassword(false); setShowConfirmPassword(false);
    setResetSent(false);
  };

  const switchView = (v: View) => { resetForm(); setView(v); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ── Forgot Password ──
    if (view === 'reset') {
      if (!email) { showError('Please enter your email.'); return; }
      setSubmitting(true);
      try {
        await apiForgotPassword(email);
        setResetSent(true);
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Failed to send reset email.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!email || !password) { showError('Please fill in all fields.'); return; }
    if (password.length < 8) { showError('Password must be at least 8 characters.'); return; }

    // ── Sign Up ──
    if (view === 'signup') {
      if (!name.trim()) { showError('Please enter your name.'); return; }
      if (password !== confirmPassword) { showError('Passwords do not match.'); return; }
      setSubmitting(true);
      try {
        await signup(email, password, name.trim(), signupRole);
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Sign up failed.');
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
      showError(err instanceof Error ? err.message : 'Sign in failed.');
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
    <main className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-1">
            OJT <span className="text-gold">Management</span>
          </h1>
          <p className="text-gray-400 text-sm">{headings[view].sub}</p>
        </div>

        <div className="bg-login-card border border-login-border rounded-2xl w-full">
          <div className="px-6 pt-5 pb-4 border-b border-login-border">
            <p className="text-white font-bold text-base">{headings[view].title}</p>
          </div>

          <div className="px-6 py-5 space-y-3">

            {/* ── LOGIN VIEW ── */}
            {view === 'login' && (
              <>
                <button
                  onClick={handleGoogle}
                  className="w-full flex items-center justify-center gap-2.5 py-2 bg-login-surface border border-login-border hover:border-gray-500 rounded-lg text-white text-xs font-medium transition-colors"
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
                  <div className="flex-1 h-px bg-login-border" />
                  <span className="text-gray-400 text-xs">or</span>
                  <div className="flex-1 h-px bg-login-border" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-2.5">
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Email address</label>
                    <input
                      type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-login-surface border border-login-border focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                    />
                  </div>
                  <PasswordField
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    show={showPassword}
                    onToggle={() => setShowPassword((s) => !s)}
                  />



                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors text-xs flex items-center justify-center gap-2"
                  >
                    {submitting && <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                    Sign in
                  </button>
                </form>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => switchView('reset')}
                    className="text-xs text-gray-400 hover:text-yellow-400 transition-colors"
                  >
                    Forgot password?
                  </button>
                  <button
                    onClick={() => switchView('signup')}
                    className="text-xs text-gray-400 hover:text-yellow-400 transition-colors"
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
                              : 'bg-login-surface border-login-border text-gray-400 hover:border-gray-500'
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
                      className="w-full bg-login-surface border border-login-border focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Email address</label>
                    <input
                      type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-login-surface border border-login-border focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                    />
                  </div>
                  <PasswordField
                    label="Password"
                    value={password}
                    onChange={setPassword}
                    placeholder="Min. 8 characters"
                    show={showPassword}
                    onToggle={() => setShowPassword((s) => !s)}
                  />
                  <PasswordField
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="••••••••"
                    show={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((s) => !s)}
                  />



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
                    className="text-xs text-gray-400 hover:text-yellow-400 transition-colors"
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
                        className="w-full bg-login-surface border border-login-border focus:border-yellow-500 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                      />
                    </div>

 
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
                    className="text-xs text-gray-400 hover:text-yellow-400 transition-colors"
                  >
                    ← Back to sign in
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </main>
  );
}
