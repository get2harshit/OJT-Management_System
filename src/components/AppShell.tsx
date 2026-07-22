import { useState } from 'react';
import { Menu, Sun, Moon } from 'lucide-react';
import Sidebar from './Sidebar';
import NotificationCenter from './NotificationCenter';
import { useTheme } from '../context/ThemeContext';
import type { PanelType } from '../lib/types';

interface AppShellProps {
  panel: PanelType;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
  children: React.ReactNode;
}

const PANEL_LABELS: Record<PanelType, string> = {
  admin: 'Admin',
  mentor: 'Mentor',
  student: 'Student',
};

// Shared layout shell for the admin/mentor/student panels: inline sidebar on
// desktop, hamburger-triggered off-canvas drawer below the lg breakpoint.
export default function AppShell({ panel, activeTab, onTabChange, onLogout, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // Auto-collapses the sidebar to its icon rail the moment any nav item is
  // picked, so the content area gets the space back immediately — the user
  // can still pin it back open with the collapse toggle at any time.
  const handleTabChange = (tab: string) => {
    setCollapsed(true);
    onTabChange(tab);
  };

  return (
    <div className="flex h-screen bg-black">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        panel={panel}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={onLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(c => !c)}
      />

      {/* The sidebar is fixed (so it stays put while this pane scrolls), which
          takes it out of normal flow — this margin reserves its width instead. */}
      <div className={`flex-1 flex flex-col min-w-0 min-h-0 transition-all duration-300 ${collapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        <header className="flex items-center justify-between h-14 px-4 sm:px-6 border-b border-zinc-750 bg-zinc-850">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
            >
              <Menu size={22} />
            </button>
            <span className="lg:hidden text-gold font-bold uppercase text-sm tracking-wider">{PANEL_LABELS[panel]}</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            <NotificationCenter />
            <button
              onClick={toggleTheme}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
            >
              {theme === 'dark' ? <Sun size={20} className="text-amber-400" /> : <Moon size={20} className="text-indigo-400" />}
            </button>
          </div>
        </header>

        <main className="flex-1 min-h-0 p-6 overflow-auto flex flex-col">
          <div className="w-full h-full flex-1 min-h-0 flex flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
