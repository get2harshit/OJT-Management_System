import { useState } from 'react';
import Sidebar from '../../components/Sidebar';
import Dashboard from './Dashboard';
import ProjectPicker from './ProjectPicker';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import { useMockData } from '../../hooks/useMockData';

export default function StudentPanel({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [initialSelectedSubId, setInitialSelectedSubId] = useState<string | null>(null);
  const [initialNewSubTaskId, setInitialNewSubTaskId] = useState<string | null>(null);
  const data = useMockData();
  const studentId = 's1'; // demo student

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
        return (
          <ProjectPicker
            studentId={studentId}
            projects={data.projects}
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
    <div className="flex min-h-screen bg-black">
      <Sidebar panel="student" activeTab={activeTab} onTabChange={setActiveTab} onLogout={onLogout} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">{renderTab()}</div>
      </main>
    </div>
  );
}
