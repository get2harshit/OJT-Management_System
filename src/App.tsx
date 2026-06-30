import { Routes, Route } from 'react-router-dom';
import { Shield, GraduationCap, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminPanel from './pages/admin';
import MentorPanel from './pages/mentor';
import StudentPanel from './pages/student';
import RoleLogin from './pages/auth/RoleLogin';
import ProtectedRoute from './components/ProtectedRoute';

function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-3">
            OJT <span className="text-gold">Management</span>
          </h1>
          <p className="text-gray-400 text-lg">Select your panel to continue</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button
            onClick={() => navigate('/admin')}
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
            onClick={() => navigate('/mentor')}
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
            onClick={() => navigate('/student')}
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
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route path="/admin" element={<RoleLogin role="admin" />} />
      <Route
        path="/admin/dashboard/*"
        element={
          <ProtectedRoute role="admin">
            <AdminPanel />
          </ProtectedRoute>
        }
      />
      {/* <Route path="/admin/dashboard/*" element={<AdminPanel />} /> */}

      <Route path="/mentor" element={<RoleLogin role="mentor" />} />
      <Route
        path="/mentor/dashboard/*"
        element={
          <ProtectedRoute role="mentor">
            <MentorPanel />
          </ProtectedRoute>
        }
      />
      {/* <Route path="/mentor/dashboard/*" element={<MentorPanel />} /> */}

      <Route path="/student" element={<RoleLogin role="student" />} />
      <Route
        path="/student/dashboard/*"
        element={
          <ProtectedRoute role="student">
            <StudentPanel />
          </ProtectedRoute>
        }
      />
      <Route path="/student/dashboard/*" element={<StudentPanel />} />
    </Routes>
  );
}