import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LoginForm from '../../components/LoginForm';

type Role = 'admin' | 'mentor' | 'student';

export default function RoleLogin({ role }: { role: Role }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Once authenticated, redirect to the appropriate dashboard
  useEffect(() => {
    if (user) {
      const userRole = user.role.toLowerCase();
      if (
        (role === 'admin' && (userRole === 'admin' || userRole === 'batch_manager')) ||
        (role === 'mentor' && (userRole === 'mentor' || userRole === 'external_mentor')) ||
        (role === 'student' && userRole === 'student')
      ) {
        navigate(`/${role}/dashboard`, { replace: true });
      }
    }
  }, [user, role, navigate]);

  return (
    <LoginForm
      role={role}
      onClose={() => navigate('/')}
    />
  );
}