import { useState } from 'react';
import { useTabParam } from '../../hooks/useTabParam';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import ProjectPicker from './ProjectPicker';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import { useAuth } from '../../context/useAuth';
import { useNotificationNavigate } from '../../context/NotificationNavigateContext';

function StudentPanelContent({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useTabParam('dashboard');
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

  useNotificationNavigate((n) => {
    switch (n.type) {
      case 'submission':
        if (n.referenceId) setInitialSelectedSubId(n.referenceId);
        setActiveTab('submissions');
        break;
      case 'task':
        setActiveTab('tasks');
        break;
      case 'allocation':
        setActiveTab('projects');
        break;
      default:
        // team_invite / announcement have no dedicated tab of their own —
        // the notification itself (Accept/Reject for an invite) is the
        // whole interaction, nothing further to navigate to.
        break;
    }
  });

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            studentId={studentId}
            onNavigateToTab={setActiveTab}
          />
        );
      case 'projects':
        return <ProjectPicker />;
      case 'tasks':
        return (
          <Tasks
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
            onNavigateToTab={setActiveTab}
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
  return <StudentPanelContent onLogout={onLogout} />;
}
