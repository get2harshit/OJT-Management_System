import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Cloud,
  CalendarCheck,
  FolderOpen,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Upload,
  CreditCard,
  Briefcase,
  Award,
} from 'lucide-react';
import type { PanelType } from '../lib/types';

interface SidebarProps {
  panel: PanelType;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const adminTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'mentors', label: 'Mentors', icon: Users },
  { id: 'ojts', label: 'OJTs', icon: Briefcase },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'submissions', label: 'Submissions', icon: FolderOpen },
  { id: 'credits', label: 'Cloud Credits', icon: Cloud },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'evaluation', label: 'Evaluation Tracker', icon: Award },
];

const mentorTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'My Students', icon: Users },
  { id: 'ojts', label: 'OJTs & Projects', icon: Briefcase },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'submissions', label: 'Submissions', icon: FolderOpen },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'evaluation', label: 'Evaluation Tracker', icon: Award },
];

const studentTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Pick Project', icon: Briefcase },
  { id: 'tasks', label: 'My Tasks', icon: CheckSquare },
  { id: 'submissions', label: 'My Submissions', icon: Upload },
  { id: 'credits', label: 'Cloud Credits', icon: CreditCard },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
];

export default function Sidebar({ panel, activeTab, onTabChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const tabs =
    panel === 'admin' ? adminTabs :
    panel === 'mentor' ? mentorTabs :
    studentTabs;

  const panelLabel =
    panel === 'admin' ? 'Admin' :
    panel === 'mentor' ? 'Mentor' :
    'Student';

  return (
    <aside
      className={`flex flex-col bg-zinc-850 border-r border-zinc-750 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-zinc-750">
        {!collapsed && (
          <span className="text-lg font-bold text-gold tracking-wider uppercase">
            {panelLabel}
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'text-gold bg-zinc-750 border-l-2 border-gold'
                  : 'text-gray-400 hover:text-white hover:bg-zinc-750'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              <Icon size={18} />
              {!collapsed && <span>{tab.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-750">
        <button
          onClick={() => window.location.reload()}
          className={`flex items-center gap-3 text-sm text-gray-400 hover:text-white transition-colors ${
            collapsed ? 'justify-center w-full' : ''
          }`}
        >
          <LogOut size={18} />
          {!collapsed && <span>Switch Panel</span>}
        </button>
      </div>
    </aside>
  );
}
