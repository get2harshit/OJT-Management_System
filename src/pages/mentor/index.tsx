import { useState } from 'react';
import AppShell from '../../components/AppShell';
import Dashboard from './Dashboard';
import OJTs from './OJTs';
import ProjectProposals from './ProjectProposals';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Attendance from './Attendance';
import EvaluationTracker from './EvaluationTracker';
import Credits from './Credits';
import { useAuth } from '../../context/useAuth';

function MentorPanelContent({ onLogout }: { onLogout?: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  // Set by Tasks' "View Submission" action to hand off which student+task
  // the Submissions tab should jump straight to; cleared once Submissions
  // consumes it so a later manual visit to the tab doesn't re-trigger it.
  const [submissionFocus, setSubmissionFocus] = useState<{ studentId: string; taskId: string } | null>(null);
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
            onNavigateToTab={setActiveTab}
          />
        );
      case 'ojts':
        return <OJTs />;
      case 'proposals':
        return <ProjectProposals />;
      case 'tasks':
        return (
          <Tasks
            mentorId={mentorId}
            onViewSubmission={(studentId, taskId) => {
              setSubmissionFocus({ studentId, taskId });
              setActiveTab('submissions');
            }}
          />
        );
      case 'submissions':
        return (
          <Submissions
            mentorId={mentorId}
            focusStudentId={submissionFocus?.studentId ?? null}
            focusTaskId={submissionFocus?.taskId ?? null}
            onFocusHandled={() => setSubmissionFocus(null)}
          />
        );
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
            onNavigateToTab={setActiveTab}
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
  return <MentorPanelContent onLogout={onLogout} />;
}
