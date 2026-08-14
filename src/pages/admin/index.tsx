import { useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useLegacyTabRedirect } from '../../hooks/useLegacyTabRedirect';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import Students from './Students';
import Mentors from './Mentors';
import Allocations from './Allocations';
import OJTs from './OJTs';
import Tasks from './Tasks';
import CreateTaskPage from './CreateTaskPage';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import Sessions from './Sessions';
import SchedulingConfig from './SchedulingConfig';
import Payouts from './Payouts';
import EvaluationTracker from './EvaluationTracker';
import EligibilityStatusPage from './EligibilityStatus';
import ViewCohortPage from './OJTs/ViewCohortPage';
import CohortStudentsPage from './OJTs/CohortStudentsPage';
import CohortProjectsPage from './OJTs/CohortProjectsPage';
import ProjectInsightsPage from './OJTs/ProjectInsightsPage';
import CohortMentorsPage from './OJTs/CohortMentorsPage';
import CohortTeamsPage from './OJTs/CohortTeamsPage';
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
        <Route path="allocations" element={<Allocations />} />
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
        <Route path="attendance" element={<Attendance />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="sessions/config" element={<SchedulingConfig />} />
        <Route path="payouts" element={<Payouts />} />
        <Route path="evaluation" element={<EvaluationTracker />} />
        <Route path="eligibility" element={<EligibilityStatusPage />} />

        {/* Pages reached from within a section. They sit under the same path
            as the section they belong to, so the sidebar keeps that section
            lit while you are inside one. */}
        <Route path="ojts/:cohortId/view" element={<ViewCohortPage />} />
        <Route path="ojts/:cohortId/students" element={<CohortStudentsPage />} />
        <Route path="ojts/:cohortId/projects" element={<CohortProjectsPage />} />
        <Route path="ojts/:cohortId/projects/insights" element={<ProjectInsightsPage />} />
        <Route path="ojts/:cohortId/track-config/:trackSlug/projects" element={<CohortProjectsPage />} />
        <Route path="ojts/:cohortId/mentors" element={<CohortMentorsPage />} />
        <Route path="ojts/:cohortId/teams" element={<CohortTeamsPage />} />
        <Route path="ojts/:cohortId/allocations" element={<CohortAllocationsPage />} />
        <Route path="ojts/:cohortId/manual-allocation" element={<ManualAllocationPage />} />
        <Route path="ojts/:cohortId/breakdown" element={<CohortOpsPage />} />
        <Route path="ojts/:cohortId/track-config" element={<CohortTrackConfigPage />} />
        <Route path="ojts/:cohortId/track-config/:trackSlug/students" element={<TrackEligibleStudentsPage />} />
        <Route path="ojts/:cohortId/track-config/:trackSlug/mentors" element={<TrackMentorsPage />} />
        {/* Registered before the :trackSlug routes above would ever match it —
            "catalog-proposal" is a page, not a track. */}
        <Route path="ojts/:cohortId/track-config-from-catalog" element={<CatalogProposalPage />} />
        <Route path="ojts/:cohortId/blueprint" element={<AllocationBlueprintPage />} />
        <Route path="ojts/:cohortId/evaluation/:configId" element={<EvaluationBlueprintPage />} />
        <Route path="ojts/:cohortId/evaluation-summary" element={<CohortEvaluationSummaryPage />} />
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
