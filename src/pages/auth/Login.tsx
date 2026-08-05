import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, GraduationCap, User, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { apiForgotPassword } from '../../lib/api';
import { consumeGoogleRedirect, startGoogleSignIn } from '../../lib/googleAuth';
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

// Google's brand mark, inline rather than from an icon set: the four-colour
// logo is required by their branding guidelines, and lucide only ships
// single-colour glyphs.
function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.7" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3.1-6.8 5.2-.1.3C7.9 41 15.4 46 24 46" />
      <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-.3l-6.9-5.3-.2.1C2.9 17 2 20.4 2 24s.9 7 2.4 10z" />
      <path fill="#EA4335" d="M24 10.2c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4 29.9 2 24 2 15.4 2 7.9 7 4.4 14l7.1 5.5c1.8-5.3 6.7-9.3 12.5-9.3" />
    </svg>
  );
}

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
          className="w-full bg-login-surface border border-login-border focus:border-gold focus:ring-1 focus:ring-gold/30 rounded-lg px-3 py-2 pr-9 text-white text-xs outline-none transition-colors placeholder-gray-600"
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
  const { user, login, signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

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
  // Distinct from `submitting`: this covers the moment between landing back
  // from Google and the session being accepted, during which the form must
  // not look idle and invite a second sign-in attempt.
  const [finishingGoogle, setFinishingGoogle] = useState(() => window.location.hash.includes('access_token'));

  useEffect(() => {
    if (user) {
      navigate(dashboardPathForRole(user.role), { replace: true });
    }
  }, [user, navigate]);

  // Google hands the session back in the URL fragment. Consuming it here —
  // rather than on a dedicated callback route — keeps Supabase's redirect
  // allow-list down to the site origin, and this page is where an error has
  // to be shown anyway.
  useEffect(() => {
    const redirect = consumeGoogleRedirect();
    if (!redirect) {
      setFinishingGoogle(false);
      return;
    }
    if (redirect.error || !redirect.session) {
      setFinishingGoogle(false);
      showError(redirect.error ?? 'Google sign-in failed. Please try again.');
      return;
    }
    const { accessToken, refreshToken } = redirect.session;
    loginWithGoogle(accessToken, refreshToken)
      .then((authUser) => showSuccess(`Logged in as ${authUser.role}`))
      .catch((err: unknown) =>
        showError(err instanceof Error ? err.message : 'Google sign-in failed.')
      )
      .finally(() => setFinishingGoogle(false));
  }, [loginWithGoogle, showError, showSuccess]);

  const resetForm = () => {
    setName(''); setEmail(''); setPassword(''); setConfirmPassword('');
    setShowPassword(false); setShowConfirmPassword(false);
    setResetSent(false);
  };

  const switchView = (v: View) => { resetForm(); setView(v); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

    if (view === 'signup') {
      if (!name.trim()) { showError('Please enter your name.'); return; }
      if (password !== confirmPassword) { showError('Passwords do not match.'); return; }
      setSubmitting(true);
      try {
        await signup(email, password, name.trim(), signupRole);
        showSuccess(`Logged in as ${signupRole}`);
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Sign up failed.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const authUser = await login(email, password);
      showSuccess(`Logged in as ${authUser.role}`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
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

        <div className="bg-login-card border border-login-border rounded-2xl w-full shadow-xl">
          <div className="px-6 pt-5 pb-4 border-b border-login-border">
            <p className="text-white font-bold text-base">{headings[view].title}</p>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* ── LOGIN VIEW ── */}
            {view === 'login' && (
              <>
                <button
                  type="button"
                  onClick={startGoogleSignIn}
                  disabled={submitting || finishingGoogle}
                  className="w-full py-2.5 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-gray-800 font-bold rounded-lg transition-all text-xs flex items-center justify-center gap-2.5 shadow-sm"
                >
                  <GoogleMark />
                  {finishingGoogle ? 'Signing you in…' : 'Continue with Google'}
                </button>

                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-login-border" />
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">or</span>
                  <span className="h-px flex-1 bg-login-border" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Email address</label>
                    <input
                      type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-login-surface border border-login-border focus:border-gold focus:ring-1 focus:ring-gold/30 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
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
                    className="w-full py-2.5 bg-gold hover:bg-gold-hover disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-all text-xs flex items-center justify-center gap-2 shadow-sm"
                  >
                    {submitting && <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                    Sign in
                  </button>
                </form>

                <div className="flex items-center justify-between pt-2 border-t border-login-border/50">
                  <button
                    onClick={() => switchView('reset')}
                    className="text-xs text-gray-400 hover:text-gold transition-colors"
                  >
                    Forgot password?
                  </button>
                  <button
                    onClick={() => switchView('signup')}
                    className="text-xs text-gray-400 hover:text-gold transition-colors font-medium"
                  >
                    Create account
                  </button>
                </div>
              </>
            )}

            {/* ── SIGNUP VIEW ── */}
            {view === 'signup' && (
              <>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-gray-400 text-xs mb-1.5 font-medium">I am a</label>
                    <div className="grid grid-cols-3 gap-2">
                      {signupRoles.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setSignupRole(value)}
                          className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                            signupRole === value
                              ? 'bg-gold/15 border-gold text-gold shadow-sm shadow-gold/10 ring-1 ring-gold/30'
                              : 'bg-login-surface border-login-border text-gray-400 hover:border-zinc-700 hover:text-gray-200'
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
                      className="w-full bg-login-surface border border-login-border focus:border-gold focus:ring-1 focus:ring-gold/30 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-1">Email address</label>
                    <input
                      type="email" required value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full bg-login-surface border border-login-border focus:border-gold focus:ring-1 focus:ring-gold/30 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
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
                    className="w-full py-2.5 bg-gold hover:bg-gold-hover disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-all text-xs flex items-center justify-center gap-2 shadow-sm"
                  >
                    {submitting && <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                    Create account
                  </button>
                </form>

                <div className="flex justify-center pt-2 border-t border-login-border/50">
                  <button
                    onClick={() => switchView('login')}
                    className="text-xs text-gray-400 hover:text-gold transition-colors font-medium"
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
                  <div className="py-4 text-center space-y-2">
                    <div className="w-12 h-12 bg-gold/15 border border-gold/30 rounded-full flex items-center justify-center mx-auto text-xl text-gold">
                      ✉️
                    </div>
                    <p className="text-white text-sm font-semibold">Check your email</p>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      We sent a password reset link to <span className="text-gold font-semibold">{email}</span>
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <p className="text-gray-400 text-xs leading-relaxed">
                      Enter your email address and we'll send you a link to reset your password.
                    </p>
                    <div>
                      <label className="block text-gray-400 text-xs mb-1">Email address</label>
                      <input
                        type="email" required value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-login-surface border border-login-border focus:border-gold focus:ring-1 focus:ring-gold/30 rounded-lg px-3 py-2 text-white text-xs outline-none transition-colors placeholder-gray-600"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-2.5 bg-gold hover:bg-gold-hover disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-all text-xs flex items-center justify-center gap-2 shadow-sm"
                    >
                      {submitting && <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                      Send reset link
                    </button>
                  </form>
                )}

                <div className="flex justify-center pt-2 border-t border-login-border/50">
                  <button
                    onClick={() => switchView('login')}
                    className="text-xs text-gray-400 hover:text-gold transition-colors font-medium"
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
