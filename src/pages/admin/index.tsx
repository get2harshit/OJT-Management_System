import { useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import Students from './Students';
import Mentors from './Mentors';
import Allocations from './Allocations';
import OJTs from './OJTs';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import EvaluationTracker from './EvaluationTracker';
import ViewCohortPage from './OJTs/ViewCohortPage';
import CohortStudentsPage from './OJTs/CohortStudentsPage';
import CohortProjectsPage from './OJTs/CohortProjectsPage';
import CohortMentorsPage from './OJTs/CohortMentorsPage';
import CohortTeamsPage from './OJTs/CohortTeamsPage';
import { useMockData } from '../../hooks/useMockData';
import { apiListCohorts, apiListProjects, apiCreateProject, apiDeleteProject } from '../../lib/api';
import { useEffect, useCallback } from 'react';
import type { Cohort, Project } from '../../lib/types';
import { useToast } from '../../toast';

export default function AdminPanel({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const navigate = useNavigate();
  const { showError } = useToast();
  const data = useMockData();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
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

  useEffect(() => {
    if (activeTab === 'allocations') {
      apiListCohorts().then(res => setCohorts(res)).catch(() => {});
    }
  }, [activeTab]);

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

  const handleBulkAddProjects = async (projs: Omit<Project, 'id' | 'created_at'>[]) => {
    try {
      for (const proj of projs) {
        const techStack = proj.related_field ? proj.related_field.split(',').map(s => s.trim()).filter(Boolean) : [];
        await apiCreateProject({
          title: proj.title,
          description: proj.description || '',
          track: proj.track,
          techStack,
        });
      }
      await fetchProjects();
    } catch (err) {
      console.error(err);
      showError('Failed during bulk import of projects.');
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

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            profiles={data.profiles}
            students={data.students}
            tasks={data.tasks}
            submissions={data.submissions}
            attendance={data.attendance}
            semesters={data.semesters}
            batches={data.batches}
            onNavigateToTab={handleTabChange}
          />
        );
      case 'students':
        return <Students />;
      case 'mentors':
        return <Mentors profiles={data.profiles} addMentor={data.addMentor} addMentors={data.addMentors} deleteProfile={data.deleteProfile} updateProfile={data.updateProfile} />;
      case 'allocations':
        return <Allocations students={data.students} profiles={data.profiles} projects={projectsList} cohorts={cohorts} updateStudent={data.updateStudent} resolveStudentChangeRequest={data.resolveStudentChangeRequest} />;
      case 'ojts':
        return (
          <OJTs
            projects={projectsList}
            addProject={handleAddProject}
            deleteProject={handleDeleteProject}
            profiles={data.profiles}
            importOJTBatch={data.importOJTBatch}
          />
        );
      case 'tasks':
        return <Tasks tasks={data.tasks} profiles={data.profiles} students={data.students} addTask={data.addTask} deleteTask={data.deleteTask} />;
      case 'submissions':
        return <Submissions submissions={data.submissions} tasks={data.tasks} profiles={data.profiles} students={data.students} comments={data.comments} addComment={data.addComment} updateSubmissionStatus={data.updateSubmissionStatus} />;
      case 'credits':
        return <Credits credits={data.credits} creditRequests={data.creditRequests} profiles={data.profiles} students={data.students} addCredit={data.addCredit} approveCreditRequest={data.approveCreditRequest} />;
      case 'attendance':
        return <Attendance attendance={data.attendance} profiles={data.profiles} students={data.students} toggleAttendance={data.toggleAttendance} markAllAttendance={data.markAllAttendance} />;
      case 'evaluation':
        return <EvaluationTracker profiles={data.profiles} students={data.students} attendance={data.attendance} updateStudent={data.updateStudent} />;
      default:
        return (
          <Dashboard
            profiles={data.profiles}
            students={data.students}
            tasks={data.tasks}
            submissions={data.submissions}
            attendance={data.attendance}
            semesters={data.semesters}
            batches={data.batches}
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
        <Route path="ojts/:cohortId/projects" element={<CohortProjectsPage projects={projectsList} addProjects={handleBulkAddProjects} />} />
        <Route path="ojts/:cohortId/mentors" element={<CohortMentorsPage />} />
        <Route path="ojts/:cohortId/teams" element={<CohortTeamsPage />} />
        <Route path="*" element={renderTab()} />
      </Routes>
    </AppShell>
  );
}
