import { useState, useRef, useEffect } from 'react';
import { Menu, Sun, Moon, User, LogOut } from 'lucide-react';
import Sidebar from './Sidebar';
import NotificationCenter from './NotificationCenter';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/useAuth';
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

function getDisplayName(user: { fullName?: string; email?: string } | null): string {
  if (!user) return '';
  if (user.fullName && user.fullName.trim() && user.fullName.trim().toLowerCase() !== 'user') {
    return user.fullName.trim();
  }
  if (user.email) {
    const handle = user.email.split('@')[0];
    return handle
      .split(/[._-]/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
  return '';
}

// Shared layout shell for the admin/mentor/student panels: inline sidebar on
// desktop, hamburger-triggered off-canvas drawer below the lg breakpoint.
export default function AppShell({ panel, activeTab, onTabChange, onLogout, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();

  let user = null;
  let logout: (() => Promise<void>) | null = null;
  try {
    const auth = useAuth();
    user = auth.user;
    logout = auth.logout;
  } catch {
    // AuthProvider not present
  }
  const displayName = getDisplayName(user);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileOpen]);

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
        onTabChange={onTabChange}
        onLogout={onLogout}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* The sidebar is fixed (out of normal flow); this margin reserves its
          resting icon-rail width. On hover it flies out to the full 64 as an
          overlay on top of this content — the margin deliberately stays at 16
          so the page never shifts under the pointer. */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 lg:ml-16">
        <header className="flex items-center justify-between h-16 px-4 sm:px-6 bg-black">
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

            {/* Profile Header Avatar (Click to Open Dropdown Down Below) */}
            {user && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2.5 rounded-full bg-zinc-800/50 hover:bg-zinc-750 transition-colors p-1 pr-3.5 ring-1 ring-zinc-700/50 hover:ring-zinc-600 active:scale-95 cursor-pointer"
                  title={displayName}
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 text-black font-bold text-xs flex items-center justify-center shadow-md shrink-0">
                    {displayName ? displayName.charAt(0).toUpperCase() : <User size={14} />}
                  </div>
                  <span className="text-xs font-semibold text-white hidden sm:block tracking-wide">
                    {PANEL_LABELS[panel]}
                  </span>
                </button>

                {/* Dropdown Menu (Visible Down On Click) */}
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-zinc-750 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-3 space-y-3">
                    <div className="flex items-center gap-3 p-2 bg-zinc-800/60 rounded-lg border border-zinc-750">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-amber-400 text-black font-bold text-xs flex items-center justify-center shrink-0 shadow-inner">
                        {displayName ? displayName.charAt(0).toUpperCase() : <User size={16} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{displayName}</p>
                        <p className="text-[10px] text-gold font-medium uppercase tracking-wider mt-0.5">{panel}</p>
                      </div>
                    </div>

                    <div className="border-t border-zinc-800 pt-2">
                      <button
                        onClick={async () => {
                          setProfileOpen(false);
                          if (onLogout) {
                            onLogout();
                          } else if (logout) {
                            await logout();
                          } else {
                            window.location.reload();
                          }
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <LogOut size={14} />
                          Sign Out
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 min-h-0 p-4 sm:p-6 lg:p-8 overflow-auto flex flex-col">
          <div className="w-full h-full flex-1 min-h-0 flex flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
