import { useState } from 'react';
import { Shield, GraduationCap, User } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginModal from './components/LoginForm';
import AdminPanel from './pages/admin';
import MentorPanel from './pages/mentor';
import StudentPanel from './pages/student';

type LoginRole = 'admin' | 'mentor' | 'student';

function AppInner() {
  const { user, loading, logout } = useAuth();
  const [loginRole, setLoginRole] = useState<LoginRole | null>(null);

  // Show loading state while restoring session
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Restoring session…</p>
        </div>
      </div>
    );
  }

  // Authenticated — route to the correct panel based on role
  if (user) {
    const role = user.role;
    if (role === 'admin' || role === 'batch_manager') {
      return <AdminPanel onLogout={logout} />;
    }
    if (role === 'mentor' || role === 'external_mentor') {
      return <MentorPanel onLogout={logout} />;
    }
    if (role === 'student') {
      return <StudentPanel onLogout={logout} />;
    }
    // Fallback for unknown roles
    return <AdminPanel onLogout={logout} />;
  }

  // Not authenticated — landing page
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-3">
            OJT <span className="text-gold">Management</span>
          </h1>
          <p className="text-gray-400 text-lg">Select your panel to sign in</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button
            onClick={() => setLoginRole('admin')}
            className="group bg-zinc-850 border border-zinc-750 rounded-2xl p-8 text-left hover:border-gold/40 hover:shadow-2xl hover:shadow-gold/5 transition-all duration-300 hover:scale-[1.02]"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-xl bg-gold/10 group-hover:bg-gold/20 transition-colors">
                <Shield size={28} className="text-gold" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Admin Panel</h2>
                <p className="text-sm text-gray-400">Full system control</p>
              </div>
            </div>
            <p className="text-gray-500 text-sm">
              Manage students, mentors, semesters, tasks, submissions, cloud credits, and attendance.
            </p>
          </button>

          <button
            onClick={() => setLoginRole('mentor')}
            className="group bg-zinc-850 border border-zinc-750 rounded-2xl p-8 text-left hover:border-gold/40 hover:shadow-2xl hover:shadow-gold/5 transition-all duration-300 hover:scale-[1.02]"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-xl bg-gold/10 group-hover:bg-gold/20 transition-colors">
                <GraduationCap size={28} className="text-gold" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Mentor Panel</h2>
                <p className="text-sm text-gray-400">Student supervision</p>
              </div>
            </div>
            <p className="text-gray-500 text-sm">
              Review submissions, manage tasks, track attendance, assign credits, and comment on student work.
            </p>
          </button>

          <button
            onClick={() => setLoginRole('student')}
            className="group bg-zinc-850 border border-zinc-750 rounded-2xl p-8 text-left hover:border-gold/40 hover:shadow-2xl hover:shadow-gold/5 transition-all duration-300 hover:scale-[1.02]"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 rounded-xl bg-gold/10 group-hover:bg-gold/20 transition-colors">
                <User size={28} className="text-gold" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Student Panel</h2>
                <p className="text-sm text-gray-400">Track your progress</p>
              </div>
            </div>
            <p className="text-gray-500 text-sm">
              View tasks, submit deliverables, track attendance, view cloud credits, and read mentor comments.
            </p>
          </button>
        </div>
      </div>

      {/* Login modal */}
      {loginRole && (
        <LoginModal
          role={loginRole}
          onClose={() => setLoginRole(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
