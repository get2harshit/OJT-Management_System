import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, RefreshCw, AlertTriangle, CheckCircle2, Megaphone, Flame, Users, Check, X, FolderCheck, FileCheck2, ClipboardList, Award } from 'lucide-react';
import { apiRespondToTeamRequest } from '../lib/api';
import { apiGetMyNotifications, apiMarkNotificationRead, apiMarkAllNotificationsRead } from '../lib/api/notifications';
import type { NotificationType } from '../lib/api/notifications';
import { useToast } from '../toast';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: NotificationType;
  read: boolean;
  priority?: 'normal' | 'important' | 'urgent';
  isInvite?: boolean;
  onAccept?: () => Promise<void>;
  onReject?: () => Promise<void>;
}

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

// The backend already scopes GET /notifications/my to the caller, including
// team_invite rows (which only ever exist for a real student recipient) —
// no panel/role prop needed to gate what's fetched anymore.
export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { showError, showSuccess } = useToast();

  // No polling — only ever runs on mount and on an explicit refresh click.
  // Team invites are real ojt_notifications rows now (type: team_invite,
  // referenceId = the team_request id) — Accept/Reject wire straight to
  // apiRespondToTeamRequest using that id, no separate team-status fetch.
  const buildNotifications = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await apiGetMyNotifications();
      setNotifications(
        list.map((n): NotificationItem => {
          const isInvite = n.type === 'team_invite' && !!n.referenceId;
          return {
            id: n.id,
            title: n.title,
            message: n.message,
            timestamp: timeAgo(n.createdAt),
            type: n.type,
            read: n.isRead,
            priority: n.priority,
            isInvite,
            onAccept: isInvite
              ? async () => {
                  try {
                    await apiRespondToTeamRequest(n.referenceId!, 'accept');
                    showSuccess('Team formed!');
                    await buildNotifications();
                  } catch (err) {
                    showError(err instanceof Error ? err.message : 'Failed to respond to request');
                  }
                }
              : undefined,
            onReject: isInvite
              ? async () => {
                  try {
                    await apiRespondToTeamRequest(n.referenceId!, 'reject');
                    showSuccess('Request rejected.');
                    await buildNotifications();
                  } catch (err) {
                    showError(err instanceof Error ? err.message : 'Failed to respond to request');
                  }
                }
              : undefined,
          };
        })
      );
    } catch {
      // Leave whatever was already showing — a failed refresh shouldn't
      // wipe the last-known list.
    } finally {
      setRefreshing(false);
    }
  }, [showError, showSuccess]);

  useEffect(() => {
    buildNotifications();
  }, [buildNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

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

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await apiMarkAllNotificationsRead();
    } catch {
      // Non-critical — local state already reflects "read"; a later refresh
      // will re-sync from the server if this silently failed.
    }
  };

  const markAsRead = async (n: NotificationItem) => {
    if (n.read || n.isInvite) return;
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    try {
      await apiMarkNotificationRead(n.id);
    } catch {
      // Same as above — local state is already updated optimistically.
    }
  };

  const iconFor = (n: NotificationItem) => {
    if (n.type === 'announcement') {
      if (n.priority === 'urgent') return <Flame size={16} className="text-red-400 animate-bounce" />;
      if (n.priority === 'important') return <AlertTriangle size={16} className="text-amber-400" />;
      return <Megaphone size={16} className="text-gold" />;
    }
    switch (n.type) {
      case 'team_invite': return <Users size={16} className="text-gold" />;
      case 'allocation': return <FolderCheck size={16} className="text-blue-400" />;
      case 'submission': return <FileCheck2 size={16} className="text-green-400" />;
      case 'task': return <ClipboardList size={16} className="text-purple-400" />;
      case 'evaluation': return <Award size={16} className="text-gold" />;
      default: return <CheckCircle2 size={16} className="text-blue-400" />;
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
              <button
                onClick={buildNotifications}
                disabled={refreshing}
                className="text-xs text-gray-400 hover:text-gold flex items-center gap-1 transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
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
                  onClick={() => markAsRead(n)}
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

                    <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">{n.message}</p>

                    {n.isInvite && (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); n.onAccept?.(); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gold text-black text-xs font-semibold rounded-lg hover:bg-gold-hover transition-colors"
                        >
                          <Check size={14} /> Accept
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); n.onReject?.(); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-750 text-white text-xs font-medium rounded-lg hover:bg-zinc-700 transition-colors"
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    )}
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
