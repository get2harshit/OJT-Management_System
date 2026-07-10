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
import { DataProvider, useData } from '../../context/DataContext';
import { useAuth } from '../../context/useAuth';

function MentorPanelContent({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const data = useData();
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
          />
        );
      case 'students':
        return <Students />;
      case 'ojts':
        return <OJTs />;
      case 'tasks':
        return <Tasks mentorId={mentorId} />;
      case 'submissions':
        return <Submissions mentorId={mentorId} />;
      case 'credits':
        return <Credits mentorId={mentorId} />;
      case 'attendance':
        return <Attendance />;
      case 'evaluation':
        return <EvaluationTracker />;
      default:
        return (
          <Dashboard
            mentorId={mentorId}
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

export default function MentorPanel({ onLogout }: { onLogout?: () => void }) {
  return (
    <DataProvider>
      <MentorPanelContent onLogout={onLogout} />
    </DataProvider>
  );
}
