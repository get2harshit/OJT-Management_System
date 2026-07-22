import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './toast';
import { ConfirmProvider } from './confirm';
import Login from './pages/auth/Login';
import ProtectedRoute from './components/ProtectedRoute';
import SpinnerSquare from './components/SpinnerSquare';
import ErrorBoundary from './components/ErrorBoundary';

import { ThemeProvider } from './context/ThemeContext';

// Each panel is its own lazily-loaded chunk so a user only downloads the
// bundle for their role (and Login stays small for first paint).
const AdminPanel = lazy(() => import('./pages/admin'));
const MentorPanel = lazy(() => import('./pages/mentor'));
const StudentPanel = lazy(() => import('./pages/student'));

function PanelLoader() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <SpinnerSquare size={64} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <DataProvider>
            <ErrorBoundary>
              <Suspense fallback={<PanelLoader />}>
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
              </Suspense>
            </ErrorBoundary>
          </DataProvider>
        </ConfirmProvider>
      </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
