import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
  LayoutDashboard,
  Users,
  Cloud,
  CalendarCheck,
  FolderOpen,
  CheckSquare,
  LogOut,
  Upload,
  CreditCard,
  Briefcase,
  Award,
  ClipboardCheck,
  ShieldCheck,
  X,
  Pin,
  PinOff,
  CalendarClock,
  Wallet,
} from 'lucide-react';
import type { PanelType } from '../lib/types';

interface SidebarProps {
  panel: PanelType;
  onLogout?: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
}

// Each section is a route under the panel's base path, so `id` doubles as the
// URL segment. Dashboard is the index — it owns the base path itself rather
// than sitting at /admin/dashboard/dashboard.
const DASHBOARD_ID = 'dashboard';

const adminTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: Users },
  { id: 'mentors', label: 'Mentors', icon: Users },
  { id: 'ojts', label: 'OJT Setup', icon: Briefcase },
  { id: 'allocations', label: 'Allocations', icon: Award },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'submissions', label: 'Submissions', icon: FolderOpen },
  { id: 'credits', label: 'Cloud Credits', icon: Cloud },
  { id: 'sessions', label: 'Sessions', icon: CalendarClock },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'payouts', label: 'Payouts', icon: Wallet },
  { id: 'evaluation', label: 'Evaluation Tracker', icon: Award },
  { id: 'eligibility', label: 'Eligibility Status', icon: ShieldCheck },
];

const mentorTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'ojts', label: 'OJTs & Projects', icon: Briefcase },
  { id: 'proposals', label: 'Project Proposals', icon: ClipboardCheck },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'submissions', label: 'Submissions', icon: FolderOpen },
  { id: 'credits', label: 'Credit Requests', icon: Cloud },
  { id: 'sessions', label: 'Sessions', icon: CalendarClock },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'payouts', label: 'Payouts', icon: Wallet },
  { id: 'evaluation', label: 'Evaluation Tracker', icon: Award },
];

const studentTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Select Project', icon: Briefcase },
  { id: 'tasks', label: 'My Tasks', icon: CheckSquare },
  { id: 'submissions', label: 'My Submissions', icon: Upload },
  { id: 'credits', label: 'Cloud Credits', icon: CreditCard },
  { id: 'sessions', label: 'Sessions', icon: CalendarClock },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
];

export default function Sidebar({
  panel,
  onLogout,
  mobileOpen,
  onCloseMobile,
  isPinned = false,
  onTogglePin,
}: SidebarProps) {
  const [hovered, setHovered] = useState(false);

  const { logout } = useAuth();

  const tabs =
    panel === 'admin' ? adminTabs :
      panel === 'mentor' ? mentorTabs :
        studentTabs;

  // Every panel is mounted at /<panel>/dashboard, and its sections are routes
  // beneath it.
  const basePath = `/${panel}/dashboard`;

  const panelLabel =
    panel === 'admin' ? 'Admin' :
      panel === 'mentor' ? 'Mentor' :
        'Student';

  const isExpanded = isPinned || hovered;
  const labelHidden = isExpanded ? '' : 'lg:hidden';
  const railCenter = isExpanded ? '' : 'lg:justify-center';

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-zinc-850 border-r border-zinc-750 transition-all duration-300 w-64 ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:translate-x-0 ${
        isExpanded ? 'lg:w-64' : 'lg:w-16'
      } ${!isPinned && hovered ? 'lg:shadow-2xl lg:shadow-black/50' : ''}`}
    >
      <div className={`flex items-center h-16 px-3.5 border-b border-zinc-750 shrink-0 ${isExpanded ? 'justify-between' : 'justify-center'}`}>
        <span className={`text-lg font-bold text-gold tracking-wider uppercase whitespace-nowrap overflow-hidden transition-all duration-200 ${labelHidden}`}>
          {panelLabel}
        </span>
        <div className="flex items-center gap-1">
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              title={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
              className="hidden lg:flex items-center justify-center p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-zinc-750 transition-colors"
            >
              {isPinned ? <PinOff size={18} /> : <Pin size={18} />}
            </button>
          )}
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <nav className="flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isDashboard = tab.id === DASHBOARD_ID;
          return (
            <NavLink
              key={tab.id}
              to={isDashboard ? basePath : `${basePath}/${tab.id}`}
              // `end` only on the index, so it doesn't light up for every
              // section. The others deliberately stay active on their own
              // sub-pages — inside a cohort, OJT Setup should still be the
              // section you are in, which the old activeTab string could not
              // express because a sub-page had no tab of its own.
              end={isDashboard}
              onClick={onCloseMobile}
              title={tab.label}
              className={({ isActive }) =>
                `w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-gold bg-zinc-750 border-l-2 border-gold'
                    : 'text-gray-400 hover:text-white hover:bg-zinc-750'
                } ${railCenter}`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className={`whitespace-nowrap overflow-hidden transition-all duration-200 ${labelHidden}`}>{tab.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-zinc-750 shrink-0">
        <button
          onClick={() => (onLogout ? onLogout() : logout())}
          className={`flex items-center gap-3 text-sm text-gray-400 hover:text-white transition-colors w-full ${railCenter}`}
        >
          <LogOut size={18} className="shrink-0" />
          <span className={`whitespace-nowrap overflow-hidden transition-all duration-200 ${labelHidden}`}>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

