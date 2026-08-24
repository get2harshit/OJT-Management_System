import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import {
  LayoutDashboard,
  Users,
  Cloud,
  CalendarCheck,
  CheckSquare,
  LogOut,
  Upload,
  CreditCard,
  Briefcase,
  ClipboardCheck,
  ShieldCheck,
  X,
  Pin,
  PinOff,
  CalendarClock,
  Wallet,
  Inbox,
  Clock,
  ClipboardList,
  HelpCircle,
  MessageSquare,
  Share2,
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
  { id: 'students', label: 'Student Directory', icon: Users },
  { id: 'mentors', label: 'Mentor Directory', icon: Users },
  { id: 'ojts', label: 'OJT Setup', icon: Briefcase },
  // Tasks and Submissions used to be here as standalone entries, each
  // keeping its own cohort picker. They now live as tabs inside OJT Setup
  // (see CohortDetailLayout) — one picker, in the URL, shared by every
  // section — so they are not duplicated here as a second door in. Same
  // move Sessions/Attendance/Allocations already made.
  { id: 'credits', label: 'Cloud Credits', icon: Cloud },
  // Cross-cohort admin queues — deliberately not nested under OJT Setup like
  // Sessions/Attendance were, since "all cohorts" is a real, load-bearing
  // view for both (a company-wide pending queue), not a state that should be
  // forced to always carry one cohort.
  { id: 'session-requests', label: 'Session Requests', icon: Inbox },
  { id: 'payouts', label: 'Payouts', icon: Wallet },
  { id: 'eligibility', label: 'Eligibility Status', icon: ShieldCheck },
];

// Tasks, Submissions, Sessions, Attendance and Evaluation used to be here as
// standalone entries, each keeping its own cohort picker. They now live as
// tabs inside My OJT (see MentorOjtLayout) — one picker, in the URL, shared
// by all of them — so they are not duplicated here as a second door in.
const mentorTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'ojts', label: 'My OJT', icon: Briefcase },
  { id: 'mentored-students', label: 'My Students', icon: Users },
  { id: 'proposals', label: 'Project Proposals', icon: ClipboardCheck },
  { id: 'credits', label: 'Credit Requests', icon: Cloud },
  { id: 'session-requests', label: 'Session Requests', icon: Inbox },
  // Sits next to Session Requests because both are inboxes, but they are
  // opposite directions: that one is this mentor asking an admin, this one
  // is their students asking them.
  { id: 'doubt-requests', label: 'Doubt Requests', icon: HelpCircle },
  { id: 'availability', label: 'My Availability', icon: Clock },
  // Deliberately not "Payouts" — the mentor-side page shows work delivered
  // (sessions, hours, teams), never rates or amounts. Kept global rather than
  // nested under one OJT — a mentor's work-summary spans every OJT they've
  // ever worked, which is a real, load-bearing "all OJTs" view.
  { id: 'work-summary', label: 'My Work Summary', icon: ClipboardList },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
];

const studentTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Select Project', icon: Briefcase },
  { id: 'tasks', label: 'My Tasks', icon: CheckSquare },
  { id: 'submissions', label: 'My Submissions', icon: Upload },
  { id: 'credits', label: 'Cloud Credits', icon: CreditCard },
  { id: 'sessions', label: 'Sessions', icon: CalendarClock },
  { id: 'doubt-requests', label: 'Ask for a Session', icon: HelpCircle },
  { id: 'resources', label: 'Resources', icon: Share2 },
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

