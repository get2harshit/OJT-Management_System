import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useLegacyTabRedirect } from '../../hooks/useLegacyTabRedirect';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import Students from './Students';
import Mentors from './Mentors';
import MentorWorkspace from './MentorWorkspace';
import MentorWorkspaceRedirect from './MentorWorkspaceRedirect';
import CohortSectionRedirect from './CohortSectionRedirect';
import OJTs from './OJTs';
import Tasks from './Tasks';
import CreateTaskPage from './CreateTaskPage';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import Sessions from './Sessions';
import SchedulingConfig from './SchedulingConfig';
import Payouts from './Payouts';
import SessionRequests from './SessionRequests';
import EligibilityStatusPage from './EligibilityStatus';
import CohortDetailLayout from './OJTs/CohortDetailLayout';
import ViewCohortPage from './OJTs/ViewCohortPage';
import CohortStudentsPage from './OJTs/CohortStudentsPage';
import CohortProjectsPage from './OJTs/CohortProjectsPage';
import ProjectInsightsPage from './OJTs/ProjectInsightsPage';
import CohortMentorsPage from './OJTs/CohortMentorsPage';
import CohortRosterPage from './OJTs/CohortRosterPage';
import CohortAllocationsPage from './OJTs/CohortAllocationsPage';
import ManualAllocationPage from './OJTs/ManualAllocationPage';
import CohortTrackConfigPage from './OJTs/CohortTrackConfigPage';
import TrackEligibleStudentsPage from './OJTs/TrackEligibleStudentsPage';
import CohortOpsPage from './OJTs/CohortOpsPage';
import TrackMentorsPage from './OJTs/TrackMentorsPage';
import CatalogProposalPage from './OJTs/CatalogProposalPage';
import AllocationBlueprintPage from './OJTs/AllocationBlueprintPage';
import EvaluationBlueprintPage from './OJTs/EvaluationBlueprintPage';
import CohortEvaluationSummaryPage from './OJTs/CohortEvaluationSummaryPage';
import { useNotificationNavigate } from '../../context/NotificationNavigateContext';
import { apiGetPrdSubmission } from '../../lib/api';
import { useToast } from '../../toast';

const BASE_PATH = '/admin/dashboard';

function AdminPanelContent({ onLogout }: { onLogout?: () => void }) {
  const navigate = useNavigate();
  useLegacyTabRedirect(BASE_PATH);

  // Sections are routes now, but callers still name the section rather than
  // the URL — a dashboard card asks to go to submissions and does not need to
  // know where submissions lives.
  //
  // This also retires the last of the old tab machinery. A sidebar click used
  // to set a search param and then navigate to the base path to close any open
  // cohort sub-page, and the second of those quietly dropped the first. A route
  // is one navigation: picking a section leaves whatever was open, by being
  // somewhere else.
  const goToSection = useCallback(
    (section: string) => navigate(`${BASE_PATH}/${section}`),
    [navigate]
  );

  // Set by Tasks' "View Submission" action to hand off which student+task
  // (and cohort — a task belongs to exactly one, which may differ from
  // Submissions' currently-selected one) the Submissions section should jump
  // straight to; cleared once Submissions consumes it so a later manual visit
  // doesn't re-trigger it. It lives on the panel, which stays mounted while its
  // routes change underneath it, so the value survives the navigation after it.
  const [submissionFocus, setSubmissionFocus] = useState<{ studentId: string; taskId: string; cohortId: string } | null>(null);
  const { showError } = useToast();

  useNotificationNavigate((n) => {
    switch (n.type) {
      case 'task':
        goToSection('tasks');
        break;
      case 'submission':
        // The notification only carries the submission's own id — resolve
        // it to the studentId/taskId/cohortId Submissions' focus props
        // actually need (same shape Tasks' own "View Submission" handoff uses).
        if (n.referenceId) {
          apiGetPrdSubmission(n.referenceId)
            .then((sub) => {
              if (sub.studentId && sub.taskId && sub.cohortId) {
                setSubmissionFocus({ studentId: sub.studentId, taskId: sub.taskId, cohortId: sub.cohortId });
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
        goToSection('allocations');
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
    <AppShell panel="admin" onLogout={onLogout}>
      <Routes>
        {/* The panel's own sections. */}
        <Route index element={<Dashboard onNavigateToSection={goToSection} />} />
        <Route path="students" element={<Students />} />
        <Route path="mentors" element={<Mentors />} />
        {/* Cohort-less entry point (global Mentors list has no cohort in
            scope at click time) — resolves a default cohort, then hands off
            to the cohort-nested Workspace route below via a replace-redirect
            so the URL always ends up carrying its cohort. */}
        <Route path="mentors/:mentorId" element={<MentorWorkspaceRedirect />} />
        {/* The standalone global Allocations page was removed — it did
            nothing but pick a cohort and land here anyway. Kept as a
            redirector, not a bare delete, since a stray bookmark or an
            'allocation' notification click (below) still points at this
            flat URL. */}
        <Route path="allocations" element={<CohortSectionRedirect section="allocations" />} />
        <Route path="ojts" element={<OJTs />} />
        <Route
          path="tasks"
          element={
            <Tasks
              onViewSubmission={(studentId, taskId, cohortId) => {
                setSubmissionFocus({ studentId, taskId, cohortId });
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
              focusCohortId={submissionFocus?.cohortId ?? null}
              onFocusHandled={() => setSubmissionFocus(null)}
            />
          }
        />
        <Route path="credits" element={<Credits />} />
        {/* Attendance and Sessions are always for exactly one cohort (unlike
            Payouts/Session Requests below, which have a real "all cohorts"
            view) — moved inside OJT Setup, URL-nested, same treatment as
            Mentor Workspace. Old flat URLs redirect so bookmarks and the
            'session' notification click-handler (below) keep working. */}
        <Route path="attendance" element={<CohortSectionRedirect section="attendance" />} />
        <Route path="sessions" element={<CohortSectionRedirect section="sessions" />} />
        <Route path="sessions/config" element={<SchedulingConfig />} />
        <Route path="payouts" element={<Payouts />} />
        <Route path="session-requests" element={<SessionRequests />} />
        {/* The standalone global Evaluation Tracker was folded into the
            Evaluation tab's config-setup section (same capability, one
            door) — kept as a redirector for the same bookmark/notification
            reasons as the other sections above. */}
        <Route path="evaluation" element={<CohortSectionRedirect section="evaluation-summary" />} />
        <Route path="eligibility" element={<EligibilityStatusPage />} />

        {/* Cohort detail — one persistent tab-bar shell around a cohort's
            top-level sections, so the same chrome and the same tabs are
            there regardless of which one a link drops you into. Keeps the
            sidebar lit on "OJT Setup" the same way the flat routes used to. */}
        <Route path="ojts/:cohortId" element={<CohortDetailLayout />}>
          <Route index element={<Navigate to="view" replace />} />
          <Route path="view" element={<ViewCohortPage />} />
          <Route path="students" element={<CohortStudentsPage />} />
          <Route path="projects" element={<CohortProjectsPage />} />
          <Route path="mentors" element={<CohortMentorsPage />} />
          <Route path="track-config" element={<CohortTrackConfigPage />} />
          <Route path="teams" element={<CohortRosterPage />} />
          <Route path="allocations" element={<CohortAllocationsPage />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="evaluation-summary" element={<CohortEvaluationSummaryPage />} />
        </Route>

        {/* Drill-downs reached from within a section above — full-page,
            their own Back button, deliberately outside the tab-bar shell so
            a screen whose job is one table doesn't compete with it for
            height. */}
        <Route path="ojts/:cohortId/mentors/:mentorId" element={<MentorWorkspace />} />
        <Route path="ojts/:cohortId/projects/insights" element={<ProjectInsightsPage />} />
        <Route path="ojts/:cohortId/track-config/:trackSlug/projects" element={<CohortProjectsPage />} />
        <Route path="ojts/:cohortId/manual-allocation" element={<ManualAllocationPage />} />
        <Route path="ojts/:cohortId/breakdown" element={<CohortOpsPage />} />
        <Route path="ojts/:cohortId/track-config/:trackSlug/students" element={<TrackEligibleStudentsPage />} />
        <Route path="ojts/:cohortId/track-config/:trackSlug/mentors" element={<TrackMentorsPage />} />
        {/* Registered before the :trackSlug routes above would ever match it —
            "catalog-proposal" is a page, not a track. */}
        <Route path="ojts/:cohortId/track-config-from-catalog" element={<CatalogProposalPage />} />
        <Route path="ojts/:cohortId/blueprint" element={<AllocationBlueprintPage />} />
        <Route path="ojts/:cohortId/evaluation/:configId" element={<EvaluationBlueprintPage />} />
        <Route path="tasks/create" element={<CreateTaskPage />} />

        {/* An unknown path is a bad link, not a blank screen. This used to
            render whatever section was open, so a typo looked like it had
            worked. */}
        <Route path="*" element={<Navigate to={BASE_PATH} replace />} />
      </Routes>
    </AppShell>
  );
}

export default function AdminPanel({ onLogout }: { onLogout?: () => void }) {
  return <AdminPanelContent onLogout={onLogout} />;
}
