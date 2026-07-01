import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AdminPanel from './pages/admin';
import MentorPanel from './pages/mentor';
import StudentPanel from './pages/student';
import Login from './pages/auth/Login';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route
          path="/admin/dashboard/*"
          element={
            <ProtectedRoute role="admin">
              <AdminPanel />
            </ProtectedRoute>
          }
        />

        <Route
          path="/mentor/dashboard/*"
          element={
            <ProtectedRoute role="mentor">
              <MentorPanel />
            </ProtectedRoute>
          }
        />

        <Route
          path="/student/dashboard/*"
          element={
            <ProtectedRoute role="student">
              <StudentPanel />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
