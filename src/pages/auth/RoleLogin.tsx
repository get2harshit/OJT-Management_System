import { useNavigate } from 'react-router-dom';
import LoginForm from '../../components/LoginForm';

type Role = 'admin' | 'mentor' | 'student';

export default function RoleLogin({ role }: { role: Role }) {
  const navigate = useNavigate();

  return (
    <LoginForm
      role={role}
      onSuccess={(r) => navigate(`/${r}/dashboard`)}
      onClose={() => navigate('/')}
    />
  );
}