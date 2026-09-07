import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, ListTodo, ChevronDown, RefreshCw, type LucideIcon } from 'lucide-react';
import { apiListTasks } from '../lib/api/tasks';
import type { ApiTask } from '../lib/api/tasks';

/**
 * Persistent, always-mounted bar for a student — their own task deadlines,
 * visible no matter which section they're on.
 *
 * Lives in AppShell rather than on any one page, so it survives navigation
 * between Tasks/Submissions/Sessions/etc without remounting or refetching on
 * every route change — the whole point of "persistent". It does NOT register
 * with RefreshContext (the header's own refresh button): that context is a
 * single last-write-wins slot meant for exactly one page's own reload
 * function, and a second registration here would silently kill whichever one
 * registers second (see RefreshContext.tsx). It keeps itself fresh instead —
 * on mount and on an interval — plus its own small manual refresh control.
 *
 * Deliberately fetches the full task list rather than asking the server for
 * counts: a student's total task count across an OJT is small (tens, not
 * thousands), the bucket boundaries here are a UI-only judgement call with no
 * server-side filter to match them, and this mirrors the same approach the
 * student Dashboard already takes for "pending tasks" — just with an explicit
 * higher limit, since Dashboard's unfiltered call inherits the list route's
 * default page size of 20 and can undercount a student with more open work
 * than that.
 */

const REFRESH_INTERVAL_MS = 3 * 60_000;
const TASK_FETCH_LIMIT = 100;

/** How far ahead a deadline has to be to still count as merely "pending" rather than "nearing". */
const DEADLINE_NEARING_HOURS = 48;

/** Remembers a student's own choice to open or close the bar, once they've made one. */
const EXPANDED_STORAGE_KEY = 'ojt_attention_bar_expanded';

type Tone = 'red' | 'amber' | 'gray';

const TONE_STYLES: Record<Tone, string> = {
  red: 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/15',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/15',
  gray: 'bg-zinc-750 text-gray-300 border-zinc-700 hover:bg-zinc-700',
};

interface TaskBuckets {
  overdue: ApiTask[];
  nearing: ApiTask[];
  pending: ApiTask[];
}

/**
 * Every one of the student's own not-yet-approved tasks, split into exactly
 * one of three buckets by how close its deadline is — never two, so the
 * three counts always add up to "everything still open" with nothing
 * double-counted.
 */
function bucketTasks(tasks: ApiTask[]): TaskBuckets {
  const now = Date.now();
  const nearingCutoff = now + DEADLINE_NEARING_HOURS * 60 * 60 * 1000;
  const buckets: TaskBuckets = { overdue: [], nearing: [], pending: [] };

  for (const task of tasks) {
    const status = task.myAssignment?.status;
    if (status !== 'pending' && status !== 'resubmit') continue;

    const deadlineMs = task.deadline ? new Date(task.deadline).getTime() : null;
    if (deadlineMs === null) {
      buckets.pending.push(task);
    } else if (deadlineMs < now) {
      buckets.overdue.push(task);
    } else if (deadlineMs <= nearingCutoff) {
      buckets.nearing.push(task);
    } else {
      buckets.pending.push(task);
    }
  }

  const byDeadline = (a: ApiTask, b: ApiTask) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
  buckets.overdue.sort(byDeadline);
  buckets.nearing.sort(byDeadline);
  buckets.pending.sort(byDeadline);
  return buckets;
}

function Chip({
  tone,
  icon: Icon,
  label,
  onClick,
}: {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${TONE_STYLES[tone]}`}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

function TaskBucketList({
  title,
  tone,
  tasks,
  onOpen,
}: {
  title: string;
  tone: Tone;
  tasks: ApiTask[];
  onOpen: () => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 ${TONE_STYLES[tone].split(' ')[1]}`}>
        {title} · {tasks.length}
      </p>
      <div className="space-y-1">
        {tasks.slice(0, 4).map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={onOpen}
            className="w-full flex items-center justify-between gap-2 text-left bg-zinc-850 border border-zinc-750 rounded-lg px-2.5 py-1.5 hover:border-zinc-600 transition-colors"
          >
            <span className="text-xs text-gray-200 truncate">{task.title}</span>
            <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">
              {new Date(task.deadline).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </span>
          </button>
        ))}
        {tasks.length > 4 && (
          <button type="button" onClick={onOpen} className="text-[10px] text-gray-500 hover:text-gray-300 pl-1">
            +{tasks.length - 4} more
          </button>
        )}
      </div>
    </div>
  );
}

export default function StudentAttentionBar() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Whether the student has ever explicitly clicked the toggle — once they
  // have, their choice wins over the auto-expand-when-urgent default below.
  const [userToggled, setUserToggled] = useState(() => {
    try {
      return localStorage.getItem(EXPANDED_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  });
  const [expanded, setExpanded] = useState(() => {
    try {
      const stored = localStorage.getItem(EXPANDED_STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const taskRes = await apiListTasks({ limit: TASK_FETCH_LIMIT });
      setTasks(taskRes.data);
    } catch {
      // Silent — this is a supplementary bar sitting above every page, not a
      // page in its own right. A page's own data load already surfaces its
      // own errors; this one failing quietly just means the bar stays as it
      // was until the next interval or manual refresh.
    } finally {
      setLoaded(true);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const buckets = useMemo(() => bucketTasks(tasks), [tasks]);

  // Opens itself the first time something genuinely urgent shows up — overdue
  // work — but only until the student makes their own choice about it, which
  // then sticks.
  useEffect(() => {
    if (userToggled || !loaded) return;
    if (buckets.overdue.length > 0) setExpanded(true);
  }, [loaded, userToggled, buckets.overdue.length]);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(EXPANDED_STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable — the toggle still works, it just won't be remembered
      }
      return next;
    });
    setUserToggled(true);
  };

  const goToTasks = useCallback(() => navigate('/student/dashboard/tasks'), [navigate]);

  if (!loaded) return null;

  const nothingToShow = buckets.overdue.length === 0 && buckets.nearing.length === 0 && buckets.pending.length === 0;
  if (nothingToShow) return null;

  return (
    <div className="border-b border-zinc-750 bg-zinc-900/60 shrink-0">
      <div
        role="button"
        tabIndex={0}
        onClick={toggleExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') toggleExpanded();
        }}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-6 py-2 cursor-pointer hover:bg-zinc-850/60 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {buckets.overdue.length > 0 && (
            <Chip tone="red" icon={AlertTriangle} label={`${buckets.overdue.length} Overdue`} onClick={goToTasks} />
          )}
          {buckets.nearing.length > 0 && (
            <Chip tone="amber" icon={Clock} label={`${buckets.nearing.length} Due Soon`} onClick={goToTasks} />
          )}
          {buckets.pending.length > 0 && (
            <Chip tone="gray" icon={ListTodo} label={`${buckets.pending.length} Pending`} onClick={goToTasks} />
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              load();
            }}
            disabled={refreshing}
            title="Refresh"
            className="p-1 rounded text-gray-500 hover:text-white disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <ChevronDown size={14} className={`text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-4 sm:px-6 pb-4 space-y-3">
          <TaskBucketList title="Overdue" tone="red" tasks={buckets.overdue} onOpen={goToTasks} />
          <TaskBucketList title="Deadline Nearing" tone="amber" tasks={buckets.nearing} onOpen={goToTasks} />
          <TaskBucketList title="Pending" tone="gray" tasks={buckets.pending} onOpen={goToTasks} />
        </div>
      )}
    </div>
  );
}
