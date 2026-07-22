import { useState, useRef, useEffect } from 'react';
import { Bell, CheckCheck, Trash2, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning';
  read: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'n1',
    title: 'CSV Import Completed',
    message: '18 project templates imported successfully into the system catalog.',
    timestamp: '10m ago',
    type: 'success',
    read: false,
  },
  {
    id: 'n2',
    title: 'Project Allocation Update',
    message: 'Allocation run draft has been generated for Cohort 2024-B1.',
    timestamp: '1h ago',
    type: 'info',
    read: false,
  },
  {
    id: 'n3',
    title: 'Review Required',
    message: '2 teams require manual review before allocation can be published.',
    timestamp: '2h ago',
    type: 'warning',
    read: false,
  },
  {
    id: 'n4',
    title: 'Cloud Credit Request',
    message: 'New AWS credit request submitted by Team STU0012.',
    timestamp: '1d ago',
    type: 'info',
    read: true,
  },
];

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors focus:outline-none"
        title="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-gold text-black font-bold text-[10px] flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-850 border border-zinc-750 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-750 bg-zinc-800/40">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-gold border border-gold/30">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-gray-400 hover:text-gold flex items-center gap-1 transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                  <span>Read all</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-gray-400 hover:text-red-400 flex items-center gap-1 transition-colors"
                  title="Clear all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-750/50">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                No notifications right now
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors ${
                    !n.read ? 'bg-zinc-800/60 hover:bg-zinc-800' : 'hover:bg-zinc-800/30'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {n.type === 'success' && <CheckCircle2 size={16} className="text-green-400" />}
                    {n.type === 'warning' && <AlertTriangle size={16} className="text-amber-400" />}
                    {n.type === 'info' && <Info size={16} className="text-blue-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-semibold ${!n.read ? 'text-white' : 'text-gray-300'}`}>
                        {n.title}
                      </p>
                      <span className="text-[10px] text-gray-500 shrink-0">{n.timestamp}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                  </div>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-gold shrink-0 mt-1.5" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
