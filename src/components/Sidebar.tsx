import { useState } from 'react';
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
  { id: 'ojts', label: 'OJTs & Projects', icon: Briefcase },
  { id: 'proposals', label: 'Project Proposals', icon: ClipboardCheck },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'submissions', label: 'Submissions', icon: FolderOpen },
  { id: 'credits', label: 'Credit Requests', icon: Cloud },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { id: 'evaluation', label: 'Evaluation Tracker', icon: Award },
];

const studentTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Select Project', icon: Briefcase },
  { id: 'tasks', label: 'My Tasks', icon: CheckSquare },
  { id: 'submissions', label: 'My Submissions', icon: Upload },
  { id: 'credits', label: 'Cloud Credits', icon: CreditCard },
  { id: 'attendance', label: 'Attendance', icon: CalendarCheck },
];

export default function Sidebar({ panel, activeTab, onTabChange, onLogout, mobileOpen, onCloseMobile }: SidebarProps) {
  // Desktop: the bar rests as a 16-wide icon rail and expands to its full
  // 64 width only while the pointer is over it — a temporary flyout that
  // overlays the content (which stays pinned at lg:ml-16), never shifting it.
  // Below lg this state is inert: the responsive classes it drives are all
  // lg:-prefixed, and the bar is a full-width off-canvas drawer there.
  const [hovered, setHovered] = useState(false);

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

  // On desktop, the expanded (labelled) look is driven purely by hover.
  const labelHidden = hovered ? '' : 'lg:hidden';
  const railCenter = hovered ? '' : 'lg:justify-center';

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`fixed inset-y-0 left-0 z-40 flex flex-col bg-zinc-850 border-r border-zinc-750 transition-all duration-300 w-64 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 ${hovered ? 'lg:w-64 lg:shadow-2xl lg:shadow-black/50' : 'lg:w-16'
        }`}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-zinc-750">
        <span className={`text-lg font-bold text-gold tracking-wider uppercase whitespace-nowrap ${labelHidden}`}>
          {panelLabel}
        </span>
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { onTabChange(tab.id); onCloseMobile(); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
                  ? 'text-gold bg-zinc-750 border-l-2 border-gold'
                  : 'text-gray-400 hover:text-white hover:bg-zinc-750'
                } ${railCenter}`}
            >
              <Icon size={18} className="shrink-0" />
              <span className={`whitespace-nowrap ${labelHidden}`}>{tab.label}</span>
            </button>
          );
        })}
      </nav>

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
          className={`flex items-center gap-3 text-sm text-gray-400 hover:text-white transition-colors w-full ${railCenter}`}
        >
          <LogOut size={18} className="shrink-0" />
          <span className={`whitespace-nowrap ${labelHidden}`}>{(onLogout || logout) ? 'Sign Out' : 'Switch Panel'}</span>
        </button>
      </div>
    </aside>
  );
}

