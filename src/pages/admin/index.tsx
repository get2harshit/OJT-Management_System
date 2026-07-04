import { useState } from 'react';
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
import { useMockData } from '../../hooks/useMockData';
import { apiListCohorts, apiListProjects, apiCreateProject, apiDeleteProject } from '../../lib/api';
import { useEffect, useCallback } from 'react';
import type { Cohort, Project } from '../../lib/types';

export default function AdminPanel({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const data = useMockData();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [projectsList, setProjectsList] = useState<Project[]>([]);

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
        description: proj.description,
        track: proj.track,
        techStack,
      });
      await fetchProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create project');
    }
  };

  const handleBulkAddProjects = async (projs: Omit<Project, 'id' | 'created_at'>[]) => {
    try {
      for (const proj of projs) {
        const techStack = proj.related_field ? proj.related_field.split(',').map(s => s.trim()).filter(Boolean) : [];
        await apiCreateProject({
          title: proj.title,
          description: proj.description,
          track: proj.track,
          techStack,
        });
      }
      await fetchProjects();
    } catch (err) {
      console.error(err);
      alert('Failed during bulk import of projects.');
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await apiDeleteProject(id);
      await fetchProjects();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete project');
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
            credits={data.credits}
            attendance={data.attendance}
            semesters={data.semesters}
            batches={data.batches}
          />
        );
      case 'students':
        return <Students profiles={data.profiles} students={data.students} batches={data.batches} semesters={data.semesters} updateStudent={data.updateStudent} addStudentRecord={data.addStudentRecord} addStudentRecords={data.addStudentRecords} deleteProfile={data.deleteProfile} />;
      case 'mentors':
        return <Mentors profiles={data.profiles} addMentor={data.addMentor} addMentors={data.addMentors} deleteProfile={data.deleteProfile} updateProfile={data.updateProfile} />;
      case 'allocations':
        return <Allocations students={data.students} profiles={data.profiles} projects={projectsList} cohorts={cohorts} updateStudent={data.updateStudent} resolveStudentChangeRequest={data.resolveStudentChangeRequest} />;
      case 'ojts':
        return (
          <OJTs
            projects={projectsList}
            addProject={handleAddProject}
            addProjects={handleBulkAddProjects}
            deleteProject={handleDeleteProject}
            profiles={data.profiles}
            students={data.students}
            updateStudent={data.updateStudent}
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
            credits={data.credits}
            attendance={data.attendance}
            semesters={data.semesters}
            batches={data.batches}
          />
        );
    }
  };

  return (
    <AppShell panel="admin" activeTab={activeTab} onTabChange={setActiveTab} onLogout={onLogout}>
      {renderTab()}
    </AppShell>
  );
}
