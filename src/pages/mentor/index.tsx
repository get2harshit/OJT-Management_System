import { useState } from 'react';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import Students from './Students';
import OJTs from './OJTs';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Attendance from './Attendance';
import EvaluationTracker from './EvaluationTracker';
import Credits from './Credits';
import { useMockData } from '../../hooks/useMockData';
import { useAuth } from '../../context/useAuth';

export default function MentorPanel({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const data = useMockData();
  let authUser = null;
  try {
    const auth = useAuth();
    authUser = auth.user;
  } catch {
    // AuthProvider not present
  }
  const mentorId = authUser?.id || 'm1'; // demo mentor

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            mentorId={mentorId}
            students={data.students}
            tasks={data.tasks}
            submissions={data.submissions}
            attendance={data.attendance}
            semesters={data.semesters}
            batches={data.batches}
          />
        );
      case 'students':
        return <Students profiles={data.profiles} students={data.students} batches={data.batches} />;
      case 'ojts':
        return <OJTs projects={data.projects} students={data.students} profiles={data.profiles} addProject={data.addProject} addProjects={data.addProjects} updateStudent={data.updateStudent} deleteProject={data.deleteProject} />;
      case 'tasks':
        return <Tasks tasks={data.tasks} mentorId={mentorId} profiles={data.profiles} students={data.students} addTask={data.addTask} deleteTask={data.deleteTask} />;
      case 'submissions':
        return <Submissions submissions={data.submissions} tasks={data.tasks} profiles={data.profiles} students={data.students} comments={data.comments} addComment={data.addComment} updateSubmissionStatus={data.updateSubmissionStatus} mentorId={mentorId} />;
      case 'credits':
        return <Credits mentorId={mentorId} creditRequests={data.creditRequests} profiles={data.profiles} students={data.students} vouchCreditRequest={data.vouchCreditRequest} />;
      case 'attendance':
        return <Attendance attendance={data.attendance} profiles={data.profiles} students={data.students} toggleAttendance={data.toggleAttendance} markAllAttendance={data.markAllAttendance} />;
      case 'evaluation':
        return <EvaluationTracker profiles={data.profiles} students={data.students} attendance={data.attendance} updateStudent={data.updateStudent} />;
      default:
        return (
          <Dashboard
            mentorId={mentorId}
            students={data.students}
            tasks={data.tasks}
            submissions={data.submissions}
            attendance={data.attendance}
            semesters={data.semesters}
            batches={data.batches}
          />
        );
    }
  };

  return (
    <AppShell panel="mentor" activeTab={activeTab} onTabChange={setActiveTab} onLogout={onLogout}>
      {renderTab()}
    </AppShell>
  );
}
