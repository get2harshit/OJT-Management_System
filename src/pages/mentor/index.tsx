import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useLegacyTabRedirect } from '../../hooks/useLegacyTabRedirect';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import OJTs from './OJTs';
import ProjectProposals from './ProjectProposals';
import Tasks from './Tasks';
import WeeklyReport from './WeeklyReport';
import Submissions from './Submissions';
import Attendance from './Attendance';
import Sessions from './Sessions';
import Payouts from './Payouts';
import SessionRequests from './SessionRequests';
import Availability from './Availability';
import EvaluationTracker from './EvaluationTracker';
import Credits from './Credits';
import { useAuth } from '../../context/useAuth';
import { useNotificationNavigate } from '../../context/NotificationNavigateContext';
import { apiGetPrdSubmission } from '../../lib/api';
import { useToast } from '../../toast';

const BASE_PATH = '/mentor/dashboard';

function MentorPanelContent({ mentorId, onLogout }: { mentorId: string; onLogout?: () => void }) {
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
      case 'session':
        goToSection('sessions');
        break;
      case 'payout':
        goToSection('payouts');
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
        {/* Its own route rather than a drawer on the Tasks page: the grid
            is ten columns wide and as tall as the mentor has teams. Nested
            under tasks/ so the back link and the tab it belongs to agree. */}
        <Route path="tasks/:taskId/weekly-report" element={<WeeklyReport />} />
        <Route path="credits" element={<Credits mentorId={mentorId} />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="payouts" element={<Payouts />} />
        <Route path="session-requests" element={<SessionRequests />} />
        <Route path="availability" element={<Availability />} />
        <Route path="evaluation" element={<EvaluationTracker />} />
        {/* An unknown section is a bad link, not a blank screen — send it to
            the panel's own front page rather than rendering nothing. */}
        <Route path="*" element={<Navigate to={BASE_PATH} replace />} />
      </Routes>
    </AppShell>
  );
}

export default function MentorPanel({ onLogout }: { onLogout?: () => void }) {
  // ProtectedRoute has already established there is a signed-in mentor, so a
  // missing user here is not a state to paper over with a stand-in id — there
  // is simply nobody to show. It used to fall back to 'm1', a demo mentor,
  // which would have quietly shown somebody else's teams and review queue.
  //
  // Resolved out here rather than inside the panel so the id the panel works
  // with is non-null by construction, and the check sits before any of the
  // panel's own hooks.
  const { user } = useAuth();
  if (!user) return null;

  return <MentorPanelContent mentorId={user.id} onLogout={onLogout} />;
}
