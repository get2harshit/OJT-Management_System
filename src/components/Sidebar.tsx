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
  X,
} from 'lucide-react';
import type { PanelType } from '../lib/types';

interface SidebarProps {
  panel: PanelType;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
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

export default function Sidebar({ panel, activeTab, onTabChange, onLogout, mobileOpen, onCloseMobile }: SidebarProps) {
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
      className={`fixed lg:static inset-y-0 left-0 z-40 flex flex-col bg-zinc-850 border-r border-zinc-750 transition-transform lg:transition-all duration-300 transform w-64 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 ${
        collapsed ? 'lg:w-16' : 'lg:w-64'
      }`}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-zinc-750">
        <span className={`text-lg font-bold text-gold tracking-wider uppercase ${collapsed ? 'lg:hidden' : ''}`}>
          {panelLabel}
        </span>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:block p-1 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { onTabChange(tab.id); onCloseMobile(); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'text-gold bg-zinc-750 border-l-2 border-gold'
                  : 'text-gray-400 hover:text-white hover:bg-zinc-750'
              } ${collapsed ? 'lg:justify-center' : ''}`}
            >
              <Icon size={18} />
              <span className={collapsed ? 'lg:hidden' : ''}>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {user && (
        <div className="p-4 border-t border-zinc-750 flex items-center gap-3 bg-zinc-800/10">
          <div className="w-8 h-8 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold font-bold text-sm shrink-0">
            {user.fullName?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
          </div>
          <div className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="text-xs font-bold text-white truncate">{user.fullName || 'User'}</p>
            <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
          </div>
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
          className={`flex items-center gap-3 text-sm text-gray-400 hover:text-white transition-colors w-full ${
            collapsed ? 'lg:justify-center' : ''
          }`}
        >
          <LogOut size={18} />
          <span className={collapsed ? 'lg:hidden' : ''}>{(onLogout || logout) ? 'Sign Out' : 'Switch Panel'}</span>
        </button>
      </div>
    </aside>
  );
}
