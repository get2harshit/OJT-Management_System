import { Navigate } from 'react-router-dom';

type Role = 'admin' | 'mentor' | 'student';

interface Props {
  role: Role;
  children: React.ReactNode;
}

export default function ProtectedRoute({ role, children }: Props) {
  const isLoggedIn = sessionStorage.getItem(`auth_${role}`) === 'true';

  if (!isLoggedIn) {
    return <Navigate to={`/${role}`} replace />;
  }

  return <>{children}</>;
}