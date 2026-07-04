import { useState } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
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

  return (
    <div className="flex min-h-screen bg-black">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        panel={panel}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onLogout={onLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between h-14 px-4 border-b border-zinc-750 bg-zinc-850">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
          >
            <Menu size={22} />
          </button>
          <span className="text-gold font-bold uppercase text-sm tracking-wider">{PANEL_LABELS[panel]}</span>
          <span className="w-[34px]" />
        </header>

        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
