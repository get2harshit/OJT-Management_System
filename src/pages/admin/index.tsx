import { useState } from 'react';
import Sidebar from '../../components/Sidebar';
import Dashboard from './Dashboard';
import Students from './Students';
import Mentors from './Mentors';
import OJTs from './OJTs';
import Tasks from './Tasks';
import Submissions from './Submissions';
import Credits from './Credits';
import Attendance from './Attendance';
import EvaluationTracker from './EvaluationTracker';
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
            semesters={data.semesters}
            batches={data.batches}
          />
        );
      case 'students':
        return <Students profiles={data.profiles} students={data.students} batches={data.batches} semesters={data.semesters} updateStudent={data.updateStudent} addStudentRecord={data.addStudentRecord} addStudentRecords={data.addStudentRecords} deleteProfile={data.deleteProfile} />;
      case 'mentors':
        return <Mentors profiles={data.profiles} addMentor={data.addMentor} addMentors={data.addMentors} deleteProfile={data.deleteProfile} />;
      case 'ojts':
        return <OJTs ojts={data.ojts} addOJT={data.addOJT} deleteOJT={data.deleteOJT} />;
      case 'tasks':
        return <Tasks tasks={data.tasks} profiles={data.profiles} students={data.students} addTask={data.addTask} deleteTask={data.deleteTask} />;
      case 'submissions':
        return <Submissions submissions={data.submissions} tasks={data.tasks} profiles={data.profiles} students={data.students} comments={data.comments} addComment={data.addComment} updateSubmissionStatus={data.updateSubmissionStatus} />;
      case 'credits':
        return <Credits credits={data.credits} profiles={data.profiles} students={data.students} addCredit={data.addCredit} />;
      case 'attendance':
        return <Attendance attendance={data.attendance} profiles={data.profiles} students={data.students} toggleAttendance={data.toggleAttendance} markAllAttendance={data.markAllAttendance} />;
      case 'evaluation':
        return <EvaluationTracker profiles={data.profiles} students={data.students} attendance={data.attendance} updateStudent={data.updateStudent} />;
      default:
        return (
          <Dashboard
            profiles={data.profiles}
            students={data.students}
            tasks={data.tasks}
            submissions={data.submissions}
            credits={data.credits}
            attendance={data.attendance}
            semesters={data.semesters}
            batches={data.batches}
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
