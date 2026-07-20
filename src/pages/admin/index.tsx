import { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
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
import CohortMentorsPage from './OJTs/CohortMentorsPage';
import CohortTeamsPage from './OJTs/CohortTeamsPage';
import CohortAllocationsPage from './OJTs/CohortAllocationsPage';

function AdminPanelContent({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const navigate = useNavigate();

  // Sidebar tab clicks only flip local state; while a cohort sub-page route
  // (view/edit/select student/project/mentor) is open, that nested route
  // still matches and keeps rendering over the tab. Navigating back to the
  // base path here clears it so the newly picked tab actually shows.
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate('/admin/dashboard');
  };

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
        return <Tasks />;
      case 'submissions':
        return <Submissions />;
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
        <Route path="ojts/:cohortId/mentors" element={<CohortMentorsPage />} />
        <Route path="ojts/:cohortId/teams" element={<CohortTeamsPage />} />
        <Route path="ojts/:cohortId/allocations" element={<CohortAllocationsPage />} />
        <Route path="tasks/create" element={<CreateTaskPage />} />
        <Route path="*" element={renderTab()} />
      </Routes>
    </AppShell>
  );
}

export default function AdminPanel({ onLogout }: { onLogout?: () => void }) {
  return <AdminPanelContent onLogout={onLogout} />;
}
