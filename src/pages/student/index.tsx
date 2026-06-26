import { useState } from 'react';
import Sidebar from '../../components/Sidebar';
import Dashboard from './Dashboard';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import { useMockData } from '../../hooks/useMockData';

export default function StudentPanel() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const data = useMockData();
  const studentId = 's1'; // demo student

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
      case 'tasks':
        return <Tasks studentId={studentId} tasks={data.tasks} submissions={data.submissions} />;
      case 'submissions':
        return (
          <Submissions
            studentId={studentId}
            submissions={data.submissions}
            tasks={data.tasks}
            comments={data.comments}
            profiles={data.profiles}
          />
        );
      case 'credits':
        return <Credits studentId={studentId} credits={data.credits} profiles={data.profiles} />;
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
      <Sidebar panel="student" activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">{renderTab()}</div>
      </main>
    </div>
  );
}
