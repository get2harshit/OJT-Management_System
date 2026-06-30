import { useNavigate } from 'react-router-dom';
import LoginForm from '../../components/LoginForm';

type Role = 'admin' | 'mentor' | 'student';

export default function RoleLogin({ role }: { role: Role }) {
  const navigate = useNavigate();

  // const isLoggedIn = sessionStorage.getItem(`auth_${role}`) === 'true';

  // if (isLoggedIn) {
  //   return <Navigate to={`/${role}/dashboard`} replace />;
  // }

  return (
    <LoginForm
      role={role}
      onSuccess={(r) => {
        sessionStorage.setItem(`auth_${r}`, 'true');
        navigate(`/${r}/dashboard`, {replace : true});
      }}
      onClose={() => navigate('/')}
    />
  );
}