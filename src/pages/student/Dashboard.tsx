import { useState, useEffect, useMemo, useCallback } from 'react';
import { CheckSquare, FolderOpen, Cloud, CalendarCheck, TrendingUp, Clock, Briefcase, UserCheck, AlertCircle, ArrowUpRight, Megaphone, RefreshCw } from 'lucide-react';
import StatCard from '../../components/StatCard';
import PeerTeamsPanel from '../../components/PeerTeamsPanel';
import SpinnerSquare from '../../components/SpinnerSquare';
import Modal from '../../components/Modal';
import OjtWeekBadge from '../../components/OjtWeekBadge';
import type { Credit, PrdSubmission, PrdStatus, MyTeamStatus, MyCohort } from '../../lib/types';
import { apiGetMySubmissions, apiGetMyCohort, apiGetMyTeamStatus, apiGetMyAttendance } from '../../lib/api';
import { apiListTasks } from '../../lib/api/tasks';
import type { ApiTask } from '../../lib/api/tasks';
import { apiGetMyNotifications, apiMarkNotificationRead } from '../../lib/api/notifications';
import type { AppNotification } from '../../lib/api/notifications';
import { useAuth } from '../../context/useAuth';
import { useCredits } from '../../hooks/useCredits';
import { usePageRefresh } from '../../context/RefreshContext';

interface Props {
  studentId: string;
  credits: Credit[];
  onNavigateToSection: (tab: string) => void;
}

// How many announcements the card holds. Newest first, and the list scrolls
// inside the card rather than stretching it — the dashboard's shape shouldn't
// change because an admin posted three more notices.
const ANNOUNCEMENT_LIMIT = 20;

// Priority is the only thing that changes an announcement's weight, so it is
// the only thing that gets a colour. Everything else stays uniform.
const ANNOUNCEMENT_TONE: Record<AppNotification['priority'], string> = {
  urgent: 'text-red-400 border-red-400/30 bg-red-400/10',
  important: 'text-gold border-gold/30 bg-gold/10',
  normal: 'text-gray-400 border-zinc-700 bg-zinc-800',
};

const SUBMISSION_STATUS_BUCKETS: { label: string; statuses: PrdStatus[]; barClass: string }[] = [
  { label: 'Pending Review', statuses: ['submitted', 'under_review'], barClass: 'bg-gold' },
  { label: 'Approved', statuses: ['approved'], barClass: 'bg-green-500' },
  { label: 'Resubmit', statuses: ['changes_requested'], barClass: 'bg-red-500' },
];

export default function StudentDashboard({
  studentId,
  credits: propCredits,
  onNavigateToSection,
}: Partial<Props> & Pick<Props, 'studentId' | 'onNavigateToSection'>) {
  const { user } = useAuth();
  const { credits: hookCredits } = useCredits();
  const credits = propCredits ?? hookCredits ?? [];

  // Sessions this student was marked present at — the real count, replacing a
  // filter over localStorage mock rows.
  const [presentCount, setPresentCount] = useState(0);

  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [submissions, setSubmissions] = useState<PrdSubmission[]>([]);
  const [teamStatus, setTeamStatus] = useState<MyTeamStatus | null>(null);
  const [myCohort, setMyCohort] = useState<MyCohort | null>(null);
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<AppNotification[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [openAnnouncement, setOpenAnnouncement] = useState<AppNotification | null>(null);

  // Its own function, not folded into loadDashboardData, because the card's
  // refresh button re-runs only this — reloading tasks, submissions and team
  // status to redraw one list would be work nobody asked for.
  const loadAnnouncements = useCallback(async () => {
    setAnnouncementsLoading(true);
    try {
      setAnnouncements(await apiGetMyNotifications({ type: 'announcement', limit: ANNOUNCEMENT_LIMIT }));
    } catch (err) {
      console.error('Announcements failed to load', err);
    } finally {
      setAnnouncementsLoading(false);
    }
  }, []);

  const loadDashboardData = useCallback(() => {
    return Promise.all([
      apiListTasks(),
      apiGetMySubmissions(),
      apiGetMyCohort()
        .then((c) => {
          setMyCohort(c);
          return apiGetMyTeamStatus(c.cohortId);
        })
        .catch(() => null),
    ])
      .then(([taskRes, mySubs, statusRes]) => {
        setTasks(taskRes.data);
        setSubmissions(mySubs.submissions);
        setTeamStatus(statusRes);
      })
      .catch((err) => console.error('Student dashboard failed to load', err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDashboardData();
    loadAnnouncements();
    // Asks the server for the count rather than pulling every attendance row
    // down to measure its length — limit 1 is enough, the total is what's read.
    apiGetMyAttendance({ status: 'present', page: 1, limit: 1 })
      .then((res) => setPresentCount(res.pagination.total))
      .catch(() => setPresentCount(0));
  }, [loadDashboardData, loadAnnouncements]);

  // The page-wide refresh covers announcements too, so the card's own button
  // is a shortcut rather than the only way to get fresh ones.
  usePageRefresh(
    useCallback(async () => {
      await Promise.all([loadDashboardData(), loadAnnouncements()]);
    }, [loadDashboardData, loadAnnouncements])
  );

  // Opening one is what reading it means, so the unread badge should agree.
  // The local row is updated too rather than refetching the list — the server
  // already knows, and a refetch would flicker the card for one changed flag.
  const openAnnouncementDetail = useCallback(async (announcement: AppNotification) => {
    setOpenAnnouncement(announcement);
    if (announcement.isRead) return;
    setAnnouncements(prev => prev.map(a => (a.id === announcement.id ? { ...a, isRead: true } : a)));
    try {
      await apiMarkNotificationRead(announcement.id);
    } catch (err) {
      console.error('Could not mark announcement read', err);
    }
  }, []);

  const myCredits = useMemo(() => credits.filter((c) => c.student_id === studentId), [credits, studentId]);

  const pendingTasks = tasks.filter((t) => {
    const status = t.myAssignment?.status;
    return status === 'pending' || status === 'resubmit';
  });

  const approvedTaskCount = tasks.filter((t) => t.myAssignment?.status === 'approved').length;
  const pendingReviewCount = submissions.filter((s) => s.status === 'submitted' || s.status === 'under_review').length;
  const totalCredits = myCredits.reduce((sum, c) => sum + Number(c.amount), 0);
  // Sessions this student was actually marked present at, from the real
  // attendance endpoint. It used to count rows of localStorage mock data
  // filtered by student_id, which meant the number was the same invented one
  // for everybody and had nothing to do with any session they attended.
  const attendanceDays = presentCount;

  const progressPct = tasks.length > 0 ? Math.round((approvedTaskCount / tasks.length) * 100) : 0;

  const userName = user?.fullName || (user?.email ? user.email.split('@')[0] : 'Student');

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8">
      {/* Personalized Greeting Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-zinc-850 border border-zinc-750 p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Welcome back, <span className="text-gold">{userName}</span> 👋
            </h1>
            <OjtWeekBadge startDate={myCohort?.startDate} endDate={myCohort?.endDate} />
          </div>
          <p className="text-gray-400 text-sm mt-1">Here is a summary of your active OJT project, tasks, and progress.</p>
        </div>
        <button
          onClick={() => onNavigateToSection('projects')}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-bold text-xs rounded-xl hover:bg-gold-hover transition-colors shadow-sm"
        >
          <Briefcase size={16} />
          View Project Details
        </button>
      </div>

      {/* Active project and announcements share the row, half each. Both
          stretch to the taller of the two so the dashboard keeps a straight
          edge whether there are no announcements or twenty. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
      {/* Active OJT Project Status Card */}
      <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-750 pb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gold/10 text-gold border border-gold/20 shrink-0">
              <Briefcase size={22} />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Active OJT Project</p>
              <h2 className="text-lg font-bold text-white">
                {teamStatus?.projectPreferences?.allocatedProjectId
                  ? 'Allocated Project'
                  : teamStatus?.team
                  ? 'Project Selection In Progress'
                  : 'No Team Joined Yet'}
              </h2>
            </div>
          </div>
          {teamStatus?.team && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gold/15 text-gold border border-gold/30">
              Track: {teamStatus.team.track || 'Unassigned'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 pt-1">
          <div className="bg-zinc-800/60 p-4 rounded-xl border border-zinc-750">
            <p className="text-xs text-gray-400 font-medium">Team Status</p>
            <p className="text-white font-bold text-sm mt-1">
              {teamStatus?.team ? (teamStatus.team.name || 'Team Formed') : 'Not Formed'}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {teamStatus?.team ? `${teamStatus.team.members.length} members` : 'Join or create a team'}
            </p>
          </div>

          <div className="bg-zinc-800/60 p-4 rounded-xl border border-zinc-750">
            <p className="text-xs text-gray-400 font-medium">Assigned Mentor</p>
            <p className="text-white font-bold text-sm mt-1 flex items-center gap-1.5">
              <UserCheck size={16} className="text-gold shrink-0" />
              {teamStatus?.projectPreferences?.allocatedMentorName || 'Pending Allocation'}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">Guidance & Reviews</p>
          </div>

          <div className="bg-zinc-800/60 p-4 rounded-xl border border-zinc-750">
            <p className="text-xs text-gray-400 font-medium">Overall Completion</p>
            <p className="text-gold font-bold text-sm mt-1">{progressPct}% Tasks Approved</p>
            <div className="h-1.5 bg-zinc-700 rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-gold rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Announcements */}
      <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-6 shadow-sm flex flex-col min-h-0">
        <div className="flex items-center justify-between border-b border-zinc-750 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gold/10 text-gold border border-gold/20 shrink-0">
              <Megaphone size={22} />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Announcements</p>
              <h2 className="text-lg font-bold text-white">
                {announcements.length > 0 ? `${announcements.length} posted` : 'Nothing yet'}
              </h2>
            </div>
          </div>
          <button
            onClick={loadAnnouncements}
            disabled={announcementsLoading}
            title="Refresh announcements"
            className="p-2 rounded-lg text-gray-400 hover:text-gold hover:bg-zinc-800 transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={16} className={announcementsLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto mt-4 -mr-2 pr-2 space-y-2">
          {announcements.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-8">
              <AlertCircle size={28} className="text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">No announcements yet</p>
              <p className="text-xs text-gray-500 mt-1">Anything your admin posts will show up here.</p>
            </div>
          ) : (
            announcements.map(a => (
              <button
                key={a.id}
                type="button"
                onClick={() => openAnnouncementDetail(a)}
                className="w-full text-left bg-zinc-800/60 border border-zinc-750 rounded-xl p-3 hover:border-gold/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-white leading-snug">{a.title}</p>
                  {/* Unread is a dot rather than a word — it repeats on every
                      row, and a row full of labels stops reading as a list. */}
                  {!a.isRead && <span className="mt-1.5 h-2 w-2 rounded-full bg-gold shrink-0" title="Unread" />}
                </div>
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.message}</p>
                <div className="flex items-center gap-2 mt-2">
                  {a.priority !== 'normal' && (
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded border ${ANNOUNCEMENT_TONE[a.priority]}`}>
                      {a.priority}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-500">
                    {new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
      </div>

      <Modal
        open={openAnnouncement !== null}
        onClose={() => setOpenAnnouncement(null)}
        title={openAnnouncement?.title ?? 'Announcement'}
      >
        {openAnnouncement && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {openAnnouncement.priority !== 'normal' && (
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${ANNOUNCEMENT_TONE[openAnnouncement.priority]}`}>
                  {openAnnouncement.priority}
                </span>
              )}
              <span className="text-xs text-gray-500">
                {new Date(openAnnouncement.createdAt).toLocaleString(undefined, {
                  day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
                })}
              </span>
            </div>
            {/* whitespace-pre-line: an admin writing a notice uses line breaks,
                and collapsing them turns a list of dates into one paragraph. */}
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{openAnnouncement.message}</p>
          </div>
        )}
      </Modal>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Pending Tasks" value={pendingTasks.length} icon={Clock} trend="To do" onClick={() => onNavigateToSection('tasks')} />
        <StatCard title="Submissions" value={submissions.length} icon={FolderOpen} onClick={() => onNavigateToSection('submissions')} />
        <StatCard title="Pending Review" value={pendingReviewCount} icon={CheckSquare} trend="Awaiting" onClick={() => onNavigateToSection('submissions')} />
        <StatCard title="Cloud Credits" value={`$${totalCredits}`} icon={Cloud} onClick={() => onNavigateToSection('credits')} />
        <StatCard title="Attendance Days" value={attendanceDays} icon={CalendarCheck} onClick={() => onNavigateToSection('attendance')} />
        <StatCard title="Progress" value={`${progressPct}%`} icon={TrendingUp} trend="Keep going" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Upcoming Tasks Countdown Card */}
        <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock size={18} className="text-gold" />
                Upcoming Task Deadlines
              </h3>
              <button
                onClick={() => onNavigateToSection('tasks')}
                className="text-xs font-semibold text-gold hover:underline flex items-center gap-1"
              >
                View all <ArrowUpRight size={14} />
              </button>
            </div>

            {pendingTasks.length === 0 ? (
              <div className="py-8 text-center text-gray-500 space-y-2">
                <AlertCircle size={32} className="mx-auto text-zinc-600" />
                <p className="text-sm font-medium text-gray-300">All tasks caught up!</p>
                <p className="text-xs text-gray-500">You have no pending task deadlines right now.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto scrollbar-thin pr-1">
                {pendingTasks.slice(0, 4).map((t) => {
                  const deadline = t.deadline ? new Date(t.deadline) : null;
                  const isPast = deadline ? deadline < new Date() : false;
                  return (
                    <div
                      key={t.id}
                      onClick={() => onNavigateToSection('tasks')}
                      className="p-3 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-750 rounded-xl cursor-pointer transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{t.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{t.description || 'No description'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {isPast ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                            Overdue
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gold/15 text-gold border border-gold/30">
                            Due {deadline ? deadline.toLocaleDateString() : 'Soon'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Submission Status Breakdown Card */}
        <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp size={18} className="text-gold" />
                Submission Status Breakdown
              </h3>
            </div>
            <div className="space-y-4">
              {SUBMISSION_STATUS_BUCKETS.map(({ label, statuses, barClass }) => {
                const count = submissions.filter((s) => statuses.includes(s.status)).length;
                const total = submissions.length || 1;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={label} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-gray-300">{label}</span>
                      <span className="text-gray-400">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2.5 bg-zinc-750 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <PeerTeamsPanel />
    </div>
  );
}
