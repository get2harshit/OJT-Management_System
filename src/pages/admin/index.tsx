import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useTabParam } from '../../hooks/useTabParam';
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
import EvaluationTracker from './EvaluationTracker';
import ViewCohortPage from './OJTs/ViewCohortPage';
import CohortStudentsPage from './OJTs/CohortStudentsPage';
import CohortProjectsPage from './OJTs/CohortProjectsPage';
import ProjectInsightsPage from './OJTs/ProjectInsightsPage';
import CohortMentorsPage from './OJTs/CohortMentorsPage';
import CohortTeamsPage from './OJTs/CohortTeamsPage';
import CohortAllocationsPage from './OJTs/CohortAllocationsPage';
import CohortTrackConfigPage from './OJTs/CohortTrackConfigPage';
import TrackEligibleStudentsPage from './OJTs/TrackEligibleStudentsPage';
import TrackMentorsPage from './OJTs/TrackMentorsPage';
import CatalogProposalPage from './OJTs/CatalogProposalPage';
import AllocationBlueprintPage from './OJTs/AllocationBlueprintPage';
import EvaluationBlueprintPage from './OJTs/EvaluationBlueprintPage';
import CohortEvaluationSummaryPage from './OJTs/CohortEvaluationSummaryPage';
import { useNotificationNavigate } from '../../context/NotificationNavigateContext';
import { apiGetPrdSubmission } from '../../lib/api';
import { useToast } from '../../toast';

function AdminPanelContent({ onLogout }: { onLogout?: () => void }) {
  // The base path goes to the hook because this panel has nested routes: while
  // a cohort sub-page (view/edit/select student/project/mentor) is open, that
  // route still matches and renders over whichever tab is picked, so choosing
  // a tab has to return to the base path as well. The hook does both in one
  // navigation — done as two calls, the path change dropped the query string
  // the tab had just been written into and every sidebar click did nothing.
  const [activeTab, handleTabChange] = useTabParam('dashboard', '/admin/dashboard');
  // Set by Tasks' "View Submission" action to hand off which student+task
  // (and cohort — a task belongs to exactly one, which may differ from
  // Submissions' currently-selected one) the Submissions tab should jump
  // straight to; cleared once Submissions consumes it so a later manual
  // visit to the tab doesn't re-trigger it.
  const [submissionFocus, setSubmissionFocus] = useState<{ studentId: string; taskId: string; cohortId: string } | null>(null);
  const { showError } = useToast();

  useNotificationNavigate((n) => {
    switch (n.type) {
      case 'task':
        handleTabChange('tasks');
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
              handleTabChange('submissions');
            })
            .catch(() => {
              showError('Could not open that submission — it may have been removed.');
              handleTabChange('submissions');
            });
        } else {
          handleTabChange('submissions');
        }
        break;
      case 'evaluation':
        handleTabChange('evaluation');
        break;
      case 'allocation':
        handleTabChange('allocations');
        break;
      default:
        break;
    }
  });

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            onNavigateToTab={handleTabChange}
          />
        );
      case 'students':
        return <Students />;
      case 'mentors':
        return <Mentors />;
      case 'allocations':
        return <Allocations />;
      case 'ojts':
        return <OJTs />;
      case 'tasks':
        return (
          <Tasks
            onViewSubmission={(studentId, taskId, cohortId) => {
              setSubmissionFocus({ studentId, taskId, cohortId });
              handleTabChange('submissions');
            }}
          />
        );
      case 'submissions':
        return (
          <Submissions
            focusStudentId={submissionFocus?.studentId ?? null}
            focusTaskId={submissionFocus?.taskId ?? null}
            focusCohortId={submissionFocus?.cohortId ?? null}
            onFocusHandled={() => setSubmissionFocus(null)}
          />
        );
      case 'credits':
        return <Credits />;
      case 'attendance':
        return <Attendance />;
      case 'evaluation':
        return <EvaluationTracker />;
      default:
        return (
          <Dashboard
            onNavigateToTab={handleTabChange}
          />
        );
    }
  };

  return (
    <AppShell panel="admin" activeTab={activeTab} onTabChange={handleTabChange} onLogout={onLogout}>
      <Routes>
        <Route path="ojts/:cohortId/view" element={<ViewCohortPage />} />
        <Route path="ojts/:cohortId/students" element={<CohortStudentsPage />} />
        <Route path="ojts/:cohortId/projects" element={<CohortProjectsPage />} />
        <Route path="ojts/:cohortId/projects/insights" element={<ProjectInsightsPage />} />
        <Route path="ojts/:cohortId/track-config/:trackSlug/projects" element={<CohortProjectsPage />} />
        <Route path="ojts/:cohortId/mentors" element={<CohortMentorsPage />} />
        <Route path="ojts/:cohortId/teams" element={<CohortTeamsPage />} />
        <Route path="ojts/:cohortId/allocations" element={<CohortAllocationsPage />} />
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
        <Route path="*" element={renderTab()} />
      </Routes>
    </AppShell>
  );
}

export default function AdminPanel({ onLogout }: { onLogout?: () => void }) {
  return <AdminPanelContent onLogout={onLogout} />;
}
