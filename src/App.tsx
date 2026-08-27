import { lazy, StrictMode, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ToastProvider } from './toast';
import { HMSRoomProvider } from '@100mslive/react-sdk';
import LiveSessionRoom from './pages/LiveSessionRoom';
import { ConfirmProvider } from './confirm';
import Login from './pages/auth/Login';
import ProtectedRoute from './components/ProtectedRoute';
import SpinnerSquare from './components/SpinnerSquare';
import ErrorBoundary from './components/ErrorBoundary';

import { ThemeProvider } from './context/ThemeContext';
import { RefreshProvider } from './context/RefreshContext';
import { NotificationNavigateProvider } from './context/NotificationNavigateContext';

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
            <RefreshProvider>
            <NotificationNavigateProvider>
            <ErrorBoundary>
              <Suspense fallback={<PanelLoader />}>
                <Routes>
                  {/* StrictMode wraps every route's element individually here,
                      not the app as a whole — deliberately excluding
                      /live-session below. React double-invokes effects under
                      StrictMode to surface non-idempotent ones, which is
                      exactly what HMSRoomProvider is: its store doesn't
                      survive the synthetic mount→cleanup→mount cleanly, so the
                      real join succeeds at the SDK level (audio/video
                      actually connects) while the React-facing isConnected
                      flag never catches up — a live session was stuck on
                      "Joining…" forever, silently connected underneath. Every
                      other route has no such live external connection to
                      desynchronize, so they keep StrictMode's benefit. */}
                  <Route path="/" element={<StrictMode><Login /></StrictMode>} />

                  <Route
                    path="/admin/dashboard/*"
                    element={
                      <StrictMode>
                        <ProtectedRoute role="admin">
                          <AdminPanel />
                        </ProtectedRoute>
                      </StrictMode>
                    }
                  />

                  <Route
                    path="/mentor/dashboard/*"
                    element={
                      <StrictMode>
                        <ProtectedRoute role="mentor">
                          <MentorPanel />
                        </ProtectedRoute>
                      </StrictMode>
                    }
                  />

                  <Route
                    path="/student/dashboard/*"
                    element={
                      <StrictMode>
                        <ProtectedRoute role="student">
                          <StudentPanel />
                        </ProtectedRoute>
                      </StrictMode>
                    }
                  />

                  {/* Outside the role panels on purpose: a live session is
                      full-screen and the same room for whoever is in it, so it
                      does not belong inside one role's shell. Reached only by
                      navigating with a token in router state. */}
                  <Route
                    path="/live-session"
                    element={
                      /* Wrapped here rather than around the app. A third-party
                         provider at the root can take everything down with it —
                         this one did, throwing on mount and blanking the login
                         page. Scoped to the one route that needs it, the worst
                         it can do is break itself. Deliberately NOT inside
                         StrictMode — see the comment at the top of this
                         Routes block. */
                      <HMSRoomProvider>
                        <LiveSessionRoom />
                      </HMSRoomProvider>
                    }
                  />

                  <Route path="*" element={<StrictMode><Navigate to="/" replace /></StrictMode>} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
            </NotificationNavigateProvider>
            </RefreshProvider>
          </DataProvider>
        </ConfirmProvider>
      </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
