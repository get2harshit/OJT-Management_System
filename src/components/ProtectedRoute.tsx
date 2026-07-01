import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type Role = 'admin' | 'mentor' | 'student';

interface Props {
  role: Role;
  children: React.ReactNode;
}

export default function ProtectedRoute({ role, children }: Props) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Verifying session…</p>
        </div>
      </div>
    );
  }

  // Map API roles like ADMIN/MENTOR/STUDENT and batch_manager/external_mentor to check allowed entry
  const userRole = user?.role?.toLowerCase();
  const hasAccess = 
    user && (
      (role === 'admin' && (userRole === 'admin' || userRole === 'batch_manager')) ||
      (role === 'mentor' && (userRole === 'mentor' || userRole === 'external_mentor')) ||
      (role === 'student' && userRole === 'student')
    );

  if (!hasAccess) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}