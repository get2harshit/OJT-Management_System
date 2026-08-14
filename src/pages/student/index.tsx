import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useLegacyTabRedirect } from '../../hooks/useLegacyTabRedirect';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import ProjectPicker from './ProjectPicker';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import Sessions from './Sessions';
import { useAuth } from '../../context/useAuth';
import { useNotificationNavigate } from '../../context/NotificationNavigateContext';

const BASE_PATH = '/student/dashboard';

function StudentPanelContent({ studentId, onLogout }: { studentId: string; onLogout?: () => void }) {
  const navigate = useNavigate();
  useLegacyTabRedirect(BASE_PATH);

  // Sections are routes now, but callers still name the section rather than
  // the URL — a dashboard card asks to go to submissions and does not need to
  // know where submissions lives.
  const goToSection = useCallback(
    (section: string) => navigate(`${BASE_PATH}/${section}`),
    [navigate]
  );

  const [initialSelectedSubId, setInitialSelectedSubId] = useState<string | null>(null);
  const [initialNewSubTaskId, setInitialNewSubTaskId] = useState<string | null>(null);

  // This hand-off state lives on the panel, which stays mounted while its
  // routes change underneath it — so a value set here survives the navigation
  // that follows it.
  const handleViewSubmission = (subId: string) => {
    setInitialSelectedSubId(subId);
    setInitialNewSubTaskId(null);
    goToSection('submissions');
  };

  const handleNewSubmission = (taskId: string) => {
    setInitialNewSubTaskId(taskId);
    setInitialSelectedSubId(null);
    goToSection('submissions');
  };

  const handleClearInitialState = () => {
    setInitialSelectedSubId(null);
    setInitialNewSubTaskId(null);
  };

  useNotificationNavigate((n) => {
    switch (n.type) {
      case 'submission':
        if (n.referenceId) setInitialSelectedSubId(n.referenceId);
        goToSection('submissions');
        break;
      case 'task':
        goToSection('tasks');
        break;
      case 'allocation':
        goToSection('projects');
        break;
      default:
        // team_invite / announcement have no dedicated section of their own —
        // the notification itself (Accept/Reject for an invite) is the
        // whole interaction, nothing further to navigate to.
        break;
    }
  });

  return (
    <AppShell panel="student" onLogout={onLogout}>
      <Routes>
        <Route index element={<Dashboard studentId={studentId} onNavigateToSection={goToSection} />} />
        <Route path="projects" element={<ProjectPicker />} />
        <Route
          path="tasks"
          element={<Tasks onViewSubmission={handleViewSubmission} onNewSubmission={handleNewSubmission} />}
        />
        <Route
          path="submissions"
          element={
            <Submissions
              studentId={studentId}
              initialSelectedSubId={initialSelectedSubId}
              initialNewSubTaskId={initialNewSubTaskId}
              onClearInitialState={handleClearInitialState}
            />
          }
        />
        <Route path="credits" element={<Credits studentId={studentId} />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="attendance" element={<Attendance />} />
        {/* An unknown section is a bad link, not a blank screen — send it to
            the panel's own front page rather than rendering nothing. */}
        <Route path="*" element={<Navigate to={BASE_PATH} replace />} />
      </Routes>
    </AppShell>
  );
}

export default function StudentPanel({ onLogout }: { onLogout?: () => void }) {
  // ProtectedRoute has already established there is a signed-in student, so a
  // missing user here is not a state to paper over with a stand-in id — there
  // is simply nobody to show. It used to fall back to 's1', which would have
  // quietly fetched a different person's tasks, submissions and credits and
  // presented them as yours.
  //
  // Resolved out here rather than inside the panel so the id the panel works
  // with is non-null by construction, and the check sits before any of the
  // panel's own hooks.
  const { user } = useAuth();
  if (!user) return null;

  return <StudentPanelContent studentId={user.id} onLogout={onLogout} />;
}
