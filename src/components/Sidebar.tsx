import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
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
  onLogout?: () => void;
}

const adminTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'mentors', label: 'Mentors', icon: Users },
  { id: 'ojts', label: 'OJT Setup', icon: Briefcase },
  { id: 'allocations', label: 'Allocations', icon: Award },
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
  { id: 'credits', label: 'Credit Requests', icon: Cloud },
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

export default function Sidebar({ panel, activeTab, onTabChange, onLogout }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  let user = null;
  let logout: (() => Promise<void>) | null = null;
  try {
    const auth = useAuth();
    user = auth.user;
    logout = auth.logout;
  } catch {
    // AuthProvider not present
  }

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

      {user && (
        <div className="p-4 border-t border-zinc-750 flex items-center gap-3 bg-zinc-800/10">
          <div className="w-8 h-8 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold font-bold text-sm shrink-0">
            {user.fullName?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{user.fullName || 'User'}</p>
              <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
            </div>
          )}
        </div>
      )}

      <div className="p-4 border-t border-zinc-750">
        <button
          onClick={async () => {
            if (onLogout) {
              onLogout();
            } else if (logout) {
              await logout();
            } else {
              window.location.reload();
            }
          }}
          className={`flex items-center gap-3 text-sm text-gray-400 hover:text-white transition-colors ${
            collapsed ? 'justify-center w-full' : ''
          }`}
        >
          <LogOut size={18} />
          {!collapsed && <span>{(onLogout || logout) ? 'Sign Out' : 'Switch Panel'}</span>}
        </button>
      </div>
    </aside>
  );
}
