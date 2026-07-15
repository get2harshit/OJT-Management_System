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
import { useData } from '../../context/DataContext';
import { apiListProjects, apiCreateProject, apiDeleteProject, apiDeleteAllProjects } from '../../lib/api';
import { useEffect, useCallback } from 'react';
import type { Project } from '../../lib/types';
import { useToast } from '../../toast';

function AdminPanelContent({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();
  const data = useData();
  const [projectsList, setProjectsList] = useState<Project[]>([]);

  // Sidebar tab clicks only flip local state; while a cohort sub-page route
  // (view/edit/select student/project/mentor) is open, that nested route
  // still matches and keeps rendering over the tab. Navigating back to the
  // base path here clears it so the newly picked tab actually shows.
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    navigate('/admin/dashboard');
  };

  const fetchProjects = useCallback(async () => {
    try {
      const res = await apiListProjects();
      setProjectsList(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Failed to fetch projects catalog', err);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleAddProject = async (proj: Omit<Project, 'id' | 'created_at'>) => {
    try {
      const techStack = proj.related_field ? proj.related_field.split(',').map(s => s.trim()).filter(Boolean) : [];
      await apiCreateProject({
        title: proj.title,
        description: proj.description || '',
        track: proj.track,
        techStack,
      });
      await fetchProjects();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await apiDeleteProject(id);
      await fetchProjects();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const handleDeleteAllProjects = async () => {
    try {
      const { deletedCount } = await apiDeleteAllProjects();
      showSuccess(`Deleted ${deletedCount} project${deletedCount === 1 ? '' : 's'}.`);
      await fetchProjects();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete all projects');
    }
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
        return (
          <OJTs
            addProject={handleAddProject}
            deleteProject={handleDeleteProject}
            deleteAllProjects={handleDeleteAllProjects}
          />
        );
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
        <Route path="ojts/:cohortId/view" element={<ViewCohortPage profiles={data.profiles} importOJTBatch={data.importOJTBatch} />} />
        <Route path="ojts/:cohortId/students" element={<CohortStudentsPage />} />
        <Route path="ojts/:cohortId/projects" element={<CohortProjectsPage projects={projectsList} onProjectsImported={fetchProjects} />} />
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
