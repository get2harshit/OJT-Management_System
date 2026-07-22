import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, Trash2, Info, AlertTriangle, CheckCircle2, Megaphone, Flame } from 'lucide-react';
import { getAnnouncements } from '../lib/announcements';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'announcement';
  read: boolean;
  targetBatch?: string;
  targetTrack?: string;
  priority?: 'normal' | 'important' | 'urgent';
}

const NOTIF_READ_KEY = 'ojt_notification_read_ids';

function getReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIF_READ_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>) {
  localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...ids]));
}

const SYSTEM_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'sys-1',
    title: 'CSV Import Completed',
    message: '18 project templates imported successfully into the system catalog.',
    timestamp: '10m ago',
    type: 'success',
    read: false,
  },
  {
    id: 'sys-2',
    title: 'Project Allocation Update',
    message: 'Allocation run draft has been generated for Cohort 2024-B1.',
    timestamp: '1h ago',
    type: 'info',
    read: false,
  },
  {
    id: 'sys-3',
    title: 'Review Required',
    message: '2 teams require manual review before allocation can be published.',
    timestamp: '2h ago',
    type: 'warning',
    read: false,
  },
];

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const buildNotifications = useCallback(() => {
    const readIds = getReadIds();

    const annNotifs: NotificationItem[] = getAnnouncements().map(a => ({
      id: a.id,
      title: a.title,
      message: a.content,
      timestamp: timeAgo(a.createdAt),
      type: 'announcement' as const,
      read: readIds.has(a.id),
      targetBatch: a.targetBatch,
      targetTrack: a.targetTrack,
      priority: a.priority,
    }));

    const sysNotifs = SYSTEM_NOTIFICATIONS.map(n => ({
      ...n,
      read: readIds.has(n.id),
    }));

    setNotifications([...annNotifs, ...sysNotifs]);
  }, []);

  useEffect(() => {
    buildNotifications();
    window.addEventListener('ojt_announcement_created', buildNotifications);
    return () => window.removeEventListener('ojt_announcement_created', buildNotifications);
  }, [buildNotifications]);

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
    const readIds = getReadIds();
    notifications.forEach(n => readIds.add(n.id));
    saveReadIds(readIds);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markAsRead = (id: string) => {
    const readIds = getReadIds();
    readIds.add(id);
    saveReadIds(readIds);
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  };

  const clearAll = () => {
    const readIds = getReadIds();
    notifications.forEach(n => readIds.add(n.id));
    saveReadIds(readIds);
    setNotifications([]);
  };

  const iconFor = (n: NotificationItem) => {
    if (n.type === 'announcement') {
      if (n.priority === 'urgent') return <Flame size={16} className="text-red-400 animate-bounce" />;
      if (n.priority === 'important') return <AlertTriangle size={16} className="text-amber-400" />;
      return <Megaphone size={16} className="text-gold" />;
    }
    switch (n.type) {
      case 'success': return <CheckCircle2 size={16} className="text-green-400" />;
      case 'warning': return <AlertTriangle size={16} className="text-amber-400" />;
      default: return <Info size={16} className="text-blue-400" />;
    }
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
                    {iconFor(n)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {n.priority === 'urgent' && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-500/20 text-red-400 border border-red-500/30 uppercase">
                            Urgent
                          </span>
                        )}
                        {n.priority === 'important' && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                            Important
                          </span>
                        )}
                        <p className={`text-xs font-semibold ${!n.read ? 'text-white' : 'text-gray-300'}`}>
                          {n.title}
                        </p>
                      </div>
                      <span className="text-[10px] text-gray-500 shrink-0">{n.timestamp}</span>
                    </div>

                    {/* Target metadata pill */}
                    {(n.targetBatch || n.targetTrack) && (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px]">
                        {n.targetBatch && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-750 text-gray-300 border border-zinc-700 font-mono">
                            Batch: {n.targetBatch}
                          </span>
                        )}
                        {n.targetTrack && (
                          <span className="px-1.5 py-0.5 rounded bg-zinc-750 text-gold/90 border border-gold/20">
                            Track: {n.targetTrack}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{n.message}</p>
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
