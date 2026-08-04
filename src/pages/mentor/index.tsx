import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useLegacyTabRedirect } from '../../hooks/useLegacyTabRedirect';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import OJTs from './OJTs';
import ProjectProposals from './ProjectProposals';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Attendance from './Attendance';
import EvaluationTracker from './EvaluationTracker';
import Credits from './Credits';
import { useAuth } from '../../context/useAuth';
import { useNotificationNavigate } from '../../context/NotificationNavigateContext';
import { apiGetPrdSubmission } from '../../lib/api';
import { useToast } from '../../toast';

const BASE_PATH = '/mentor/dashboard';

function MentorPanelContent({ onLogout }: { onLogout?: () => void }) {
  const navigate = useNavigate();
  useLegacyTabRedirect(BASE_PATH);

  // Sections are routes now, but callers still name the section rather than
  // the URL — a dashboard card asks to go to submissions and does not need to
  // know where submissions lives.
  const goToSection = useCallback(
    (section: string) => navigate(`${BASE_PATH}/${section}`),
    [navigate]
  );

  // Set by Tasks' "View Submission" action to hand off which student+task
  // the Submissions section should jump straight to; cleared once Submissions
  // consumes it so a later manual visit doesn't re-trigger it. It lives on the
  // panel, which stays mounted while its routes change underneath it, so the
  // value survives the navigation that follows it.
  const [submissionFocus, setSubmissionFocus] = useState<{ studentId: string; taskId?: string } | null>(null);
  let authUser = null;
  try {
    const auth = useAuth();
    authUser = auth.user;
  } catch {
    // AuthProvider not present
  }
  const mentorId = authUser?.id || 'm1'; // demo mentor
  const { showError } = useToast();

  useNotificationNavigate((n) => {
    switch (n.type) {
      case 'task':
        goToSection('tasks');
        break;
      case 'submission':
        // The notification only carries the submission's own id — resolve
        // it to the studentId/taskId Submissions' focus props actually need
        // (same shape Tasks' own "View Submission" handoff above already uses).
        if (n.referenceId) {
          apiGetPrdSubmission(n.referenceId)
            .then((sub) => {
              if (sub.studentId) {
                setSubmissionFocus({ studentId: sub.studentId, taskId: sub.taskId });
              }
              goToSection('submissions');
            })
            .catch(() => {
              showError('Could not open that submission — it may have been removed.');
              goToSection('submissions');
            });
        } else {
          goToSection('submissions');
        }
        break;
      case 'evaluation':
        goToSection('evaluation');
        break;
      case 'allocation':
        goToSection('ojts');
        break;
      default:
        break;
    }
  });

  return (
    <AppShell panel="mentor" onLogout={onLogout}>
      <Routes>
        <Route index element={<Dashboard mentorId={mentorId} onNavigateToSection={goToSection} />} />
        <Route path="ojts" element={<OJTs />} />
        <Route path="proposals" element={<ProjectProposals />} />
        <Route
          path="tasks"
          element={
            <Tasks
              mentorId={mentorId}
              onViewSubmission={(studentId, taskId) => {
                setSubmissionFocus({ studentId, taskId });
                goToSection('submissions');
              }}
            />
          }
        />
        <Route
          path="submissions"
          element={
            <Submissions
              mentorId={mentorId}
              focusStudentId={submissionFocus?.studentId ?? null}
              focusTaskId={submissionFocus?.taskId ?? null}
              onFocusHandled={() => setSubmissionFocus(null)}
            />
          }
        />
        <Route path="credits" element={<Credits mentorId={mentorId} />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="evaluation" element={<EvaluationTracker />} />
        {/* An unknown section is a bad link, not a blank screen — send it to
            the panel's own front page rather than rendering nothing. */}
        <Route path="*" element={<Navigate to={BASE_PATH} replace />} />
      </Routes>
    </AppShell>
  );
}

export default function MentorPanel({ onLogout }: { onLogout?: () => void }) {
  return <MentorPanelContent onLogout={onLogout} />;
}
