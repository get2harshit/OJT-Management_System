import { useState } from 'react';
import Sidebar from '../../components/Sidebar';
import Dashboard from './Dashboard';
import Students from './Students';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import Comments from './Comments';
import { useMockData } from '../../hooks/useMockData';

export default function MentorPanel() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const data = useMockData();
  const mentorId = 'm1'; // demo mentor

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            mentorId={mentorId}
            profiles={data.profiles}
            students={data.students}
            tasks={data.tasks}
            submissions={data.submissions}
            credits={data.credits}
            attendance={data.attendance}
          />
        );
      case 'students':
        return <Students profiles={data.profiles} students={data.students} batches={data.batches} />;
      case 'tasks':
        return <Tasks tasks={data.tasks} mentorId={mentorId} />;
      case 'submissions':
        return <Submissions submissions={data.submissions} tasks={data.tasks} profiles={data.profiles} students={data.students} />;
      case 'credits':
        return <Credits credits={data.credits} profiles={data.profiles} />;
      case 'attendance':
        return <Attendance attendance={data.attendance} profiles={data.profiles} students={data.students} />;
      case 'comments':
        return <Comments comments={data.comments} profiles={data.profiles} submissions={data.submissions} tasks={data.tasks} />;
      default:
        return (
          <Dashboard
            mentorId={mentorId}
            profiles={data.profiles}
            students={data.students}
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
      <Sidebar panel="mentor" activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">{renderTab()}</div>
      </main>
    </div>
  );
}
