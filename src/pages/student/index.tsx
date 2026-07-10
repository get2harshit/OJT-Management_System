import { useState } from 'react';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import ProjectPicker from './ProjectPicker';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import { DataProvider } from '../../context/DataContext';
import { useAuth } from '../../context/useAuth';

function StudentPanelContent({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [initialSelectedSubId, setInitialSelectedSubId] = useState<string | null>(null);
  const [initialNewSubTaskId, setInitialNewSubTaskId] = useState<string | null>(null);

  let authUser = null;
  try {
    const auth = useAuth();
    authUser = auth.user;
  } catch {
    // AuthProvider not present
  }
  const studentId = authUser?.id || 's1';

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
          />
        );
      case 'projects':
        return <ProjectPicker />;
      case 'tasks':
        return (
          <Tasks
            studentId={studentId}
            onViewSubmission={handleViewSubmission}
            onNewSubmission={handleNewSubmission}
          />
        );
      case 'submissions':
        return (
          <Submissions
            studentId={studentId}
            initialSelectedSubId={initialSelectedSubId}
            initialNewSubTaskId={initialNewSubTaskId}
            onClearInitialState={handleClearInitialState}
          />
        );
      case 'credits':
        return (
          <Credits
            studentId={studentId}
          />
        );
      case 'attendance':
        return <Attendance studentId={studentId} />;
      default:
        return (
          <Dashboard
            studentId={studentId}
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

export default function StudentPanel({ onLogout }: { onLogout?: () => void }) {
  return (
    <DataProvider>
      <StudentPanelContent onLogout={onLogout} />
    </DataProvider>
  );
}
