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
import { useAuth } from '../../context/useAuth';
import { useNotificationNavigate } from '../../context/NotificationNavigateContext';

const BASE_PATH = '/student/dashboard';

function StudentPanelContent({ onLogout }: { onLogout?: () => void }) {
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

  let authUser = null;
  try {
    const auth = useAuth();
    authUser = auth.user;
  } catch {
    // AuthProvider not present
  }
  const studentId = authUser?.id || 's1';

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
        <Route path="attendance" element={<Attendance studentId={studentId} />} />
        {/* An unknown section is a bad link, not a blank screen — send it to
            the panel's own front page rather than rendering nothing. */}
        <Route path="*" element={<Navigate to={BASE_PATH} replace />} />
      </Routes>
    </AppShell>
  );
}

export default function StudentPanel({ onLogout }: { onLogout?: () => void }) {
  return <StudentPanelContent onLogout={onLogout} />;
}
