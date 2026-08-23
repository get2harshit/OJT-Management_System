import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useLegacyTabRedirect } from '../../hooks/useLegacyTabRedirect';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import OJTs from './OJTs';
import MentorOjtLayout from './ojt/MentorOjtLayout';
import MentorOjtRedirect from './ojt/MentorOjtRedirect';
import ProjectProposals from './ProjectProposals';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Attendance from './Attendance';
import Sessions from './Sessions';
import WorkSummary from './WorkSummary';
import SessionRequests from './SessionRequests';
import DoubtRequests from './DoubtRequests';
import Chat from './Chat';
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
        goToSection('work-summary');
        break;
      default:
        break;
    }
  });

  return (
    <AppShell panel="mentor" onLogout={onLogout}>
      <Routes>
        <Route index element={<Dashboard mentorId={mentorId} onNavigateToSection={goToSection} />} />

        {/* Everything a mentor does inside one OJT lives under its id, so the
            OJT is bookmarkable and every tab agrees on which one is open. */}
        <Route path="ojts/:cohortId" element={<MentorOjtLayout />}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OJTs />} />
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
                focusStudentId={submissionFocus?.studentId ?? null}
                focusTaskId={submissionFocus?.taskId ?? null}
                onFocusHandled={() => setSubmissionFocus(null)}
              />
            }
          />
          <Route path="sessions" element={<Sessions />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="evaluation" element={<EvaluationTracker />} />
        </Route>

        {/* The flat section URLs every existing bookmark and every
            notification click-handler still uses. They resolve an OJT and
            hand off, so nothing that names a bare section had to change. */}
        <Route path="ojts" element={<MentorOjtRedirect section="overview" />} />
        <Route path="tasks" element={<MentorOjtRedirect section="tasks" />} />
        <Route path="submissions" element={<MentorOjtRedirect section="submissions" />} />
        <Route path="sessions" element={<MentorOjtRedirect section="sessions" />} />
        <Route path="attendance" element={<MentorOjtRedirect section="attendance" />} />
        <Route path="evaluation" element={<MentorOjtRedirect section="evaluation" />} />

        <Route path="proposals" element={<ProjectProposals />} />
        <Route path="credits" element={<Credits mentorId={mentorId} />} />
        <Route path="work-summary" element={<WorkSummary />} />
        {/* Payout notifications and any old link still say "payouts" — the
            mentor-side page is now about work delivered, not money. */}
        <Route path="payouts" element={<Navigate to={`${BASE_PATH}/work-summary`} replace />} />
        <Route path="session-requests" element={<SessionRequests />} />
        <Route path="doubt-requests" element={<DoubtRequests />} />
        <Route path="chat" element={<Chat />} />
        <Route path="availability" element={<Availability />} />
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
