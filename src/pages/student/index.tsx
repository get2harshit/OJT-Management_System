import { useState, useEffect } from 'react';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import ProjectPicker from './ProjectPicker';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import { useMockData } from '../../hooks/useMockData';
import { useAuth } from '../../context/AuthContext';
import SpinnerSquare from '../../components/SpinnerSquare';
import { apiGetProjectsForCohort, apiListProjects } from '../../lib/api';
import type { Project } from '../../lib/types';

export default function StudentPanel({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [initialSelectedSubId, setInitialSelectedSubId] = useState<string | null>(null);
  const [initialNewSubTaskId, setInitialNewSubTaskId] = useState<string | null>(null);
  const data = useMockData();

  let authUser = null;
  try {
    const auth = useAuth();
    authUser = auth.user;
  } catch {
    // AuthProvider not present
  }
  const studentId = authUser?.id || 's1';

  const [cohortProjects, setCohortProjects] = useState<Project[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  useEffect(() => {
    apiListProjects()
      .then(res => setAllProjects(Array.isArray(res) ? res : []))
      .catch(err => console.error('Failed to load projects catalog fallback', err));
  }, []);

  const student = data.students.find(s => s.user_id === studentId);
  const studentCohortId = student?.ojt_id;

  useEffect(() => {
    if (!studentCohortId) {
      setCohortProjects([]);
      return;
    }
    setLoadingProjects(true);
    apiGetProjectsForCohort(studentCohortId)
      .then(res => {
        setCohortProjects(Array.isArray(res) ? res : []);
      })
      .catch(err => {
        console.error('Failed to load cohort projects, falling back to all projects.', err);
        setCohortProjects([]);
      })
      .finally(() => {
        setLoadingProjects(false);
      });
  }, [studentCohortId]);

  const handleViewSubmission = (subId: string) => {
    setInitialSelectedSubId(subId);
    setInitialNewSubTaskId(null);
    setActiveTab('submissions');
  };

  const handleNewSubmission = (taskId: string) => {
    setInitialNewSubTaskId(taskId);
    setInitialSelectedSubId(null);
    setActiveTab('submissions');
  };

  const handleClearInitialState = () => {
    setInitialSelectedSubId(null);
    setInitialNewSubTaskId(null);
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            studentId={studentId}
            tasks={data.tasks}
            submissions={data.submissions}
            credits={data.credits}
            attendance={data.attendance}
          />
        );
      case 'projects':
        if (loadingProjects) {
          return (
            <div className="min-h-[50vh] flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <SpinnerSquare size={56} />
                <p className="text-gray-400 text-sm">Loading cohort projects…</p>
              </div>
            </div>
          );
        }
        return (
          <ProjectPicker
            studentId={studentId}
            projects={cohortProjects.length > 0 ? cohortProjects : allProjects}
            isCohortFiltered={cohortProjects.length > 0}
            students={data.students}
            profiles={data.profiles}
            updateStudent={data.updateStudent}
            addStudentChangeRequest={data.addStudentChangeRequest}
          />
        );
      case 'tasks':
        return (
          <Tasks
            studentId={studentId}
            tasks={data.tasks}
            submissions={data.submissions}
            onViewSubmission={handleViewSubmission}
            onNewSubmission={handleNewSubmission}
          />
        );
      case 'submissions':
        return (
          <Submissions
            studentId={studentId}
            submissions={data.submissions}
            tasks={data.tasks}
            comments={data.comments}
            profiles={data.profiles}
            addComment={data.addComment}
            addSubmission={data.addSubmission}
            initialSelectedSubId={initialSelectedSubId}
            initialNewSubTaskId={initialNewSubTaskId}
            onClearInitialState={handleClearInitialState}
          />
        );
      case 'credits':
        return (
          <Credits
            studentId={studentId}
            credits={data.credits}
            creditRequests={data.creditRequests}
            profiles={data.profiles}
            addCreditRequest={data.addCreditRequest}
          />
        );
      case 'attendance':
        return <Attendance studentId={studentId} attendance={data.attendance} profiles={data.profiles} />;
      default:
        return (
          <Dashboard
            studentId={studentId}
            tasks={data.tasks}
            submissions={data.submissions}
            credits={data.credits}
            attendance={data.attendance}
          />
        );
    }
  };

  return (
    <AppShell panel="student" activeTab={activeTab} onTabChange={setActiveTab} onLogout={onLogout}>
      {renderTab()}
    </AppShell>
  );
}
