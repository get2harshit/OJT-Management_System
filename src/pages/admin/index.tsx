import { useState } from 'react';
import Sidebar from '../../components/Sidebar';
import Dashboard from './Dashboard';
import Students from './Students';
import Mentors from './Mentors';
import Semesters from './Semesters';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import { useMockData } from '../../hooks/useMockData';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const data = useMockData();

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
          />
        );
      case 'students':
        return <Students profiles={data.profiles} students={data.students} batches={data.batches} />;
      case 'mentors':
        return <Mentors profiles={data.profiles} />;
      case 'semesters':
        return <Semesters semesters={data.semesters} />;
      case 'tasks':
        return <Tasks tasks={data.tasks} profiles={data.profiles} />;
      case 'submissions':
        return <Submissions submissions={data.submissions} tasks={data.tasks} profiles={data.profiles} students={data.students} />;
      case 'credits':
        return <Credits credits={data.credits} profiles={data.profiles} students={data.students} />;
      case 'attendance':
        return <Attendance attendance={data.attendance} profiles={data.profiles} students={data.students} />;
      default:
        return (
          <Dashboard
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
      <Sidebar panel="admin" activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">{renderTab()}</div>
      </main>
    </div>
  );
}
