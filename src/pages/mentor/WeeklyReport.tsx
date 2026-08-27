import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle2, Loader2 } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import Button from '../../components/Button';
import WeeklyReportGrid, { WeeklyReportSummaryStrip } from '../../components/WeeklyReportGrid';
import type { WeeklyReportGridChange } from '../../components/WeeklyReportGrid';
import {
  apiGetMyWeeklyReport,
  apiResubmitTask,
  apiSaveWeeklyReportTeam,
  apiSubmitTask,
} from '../../lib/api/tasks';
import type { ApiMyWeeklyReport, ApiWeeklyReportTeam, SaveWeeklyReportTeamPayload } from '../../lib/api/tasks';
import { useToast } from '../../toast';

/** How long to wait after the last edit in a team's row before saving it. */
const AUTOSAVE_DELAY_MS = 500;

/** A team counts as reported on once the mentor has put anything at all in it. */
function isTeamFilled(team: ApiWeeklyReportTeam): boolean {
  return (
    team.projectStatus !== null ||
    team.teamHealth !== null ||
    (team.weeklyFeedback ?? '').trim() !== '' ||
    team.students.some((s) => s.techSkill !== null || s.communication !== null || s.overallPerformance !== null)
  );
}

export default function WeeklyReport() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { showError, showSuccess } = useToast();

  const [report, setReport] = useState<ApiMyWeeklyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingTeams, setSavingTeams] = useState<Set<string>>(new Set());
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Per-team debounce timers. A mentor moves across a row of dropdowns fast,
  // and one request per dropdown would be a dozen writes for one team —
  // while two different teams edited in quick succession must still both be
  // saved, so the timers are keyed by team rather than shared.
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // The grid state as the user has it right now, read by the debounced save
  // when it eventually fires. Kept in a ref alongside the state so a save
  // scheduled before the last keystroke still sends the latest values.
  const latestTeams = useRef<ApiWeeklyReportTeam[]>([]);

  const load = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiGetMyWeeklyReport(taskId);
      setReport(data);
      latestTeams.current = data.teams;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load this report');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    load();
  }, [load]);

  const persistTeam = useCallback(
    (teamId: string) => {
      if (!taskId) return null;
      const team = latestTeams.current.find((t) => t.teamId === teamId);
      // A team recovered from an earlier report is not this mentor's to
      // change; the server refuses it, so don't ask.
      if (!team || team.isFormerTeam) return null;

      // The whole row every time, not just the field that changed: the
      // endpoint is idempotent, and sending the current state means a save
      // that lands out of order still leaves the server holding what the
      // mentor is actually looking at.
      const payload: SaveWeeklyReportTeamPayload = {
        projectStatus: team.projectStatus,
        teamHealth: team.teamHealth,
        weeklyFeedback: team.weeklyFeedback,
        techStack: team.techStack,
        students: team.students
          .filter((s) => !s.isFormerMember)
          .map((s) => ({
            studentId: s.studentId,
            techSkill: s.techSkill,
            communication: s.communication,
            overallPerformance: s.overallPerformance,
          })),
      };
      return apiSaveWeeklyReportTeam(taskId, teamId, payload);
    },
    [taskId]
  );

  const flushTeam = useCallback(
    async (teamId: string) => {
      setSavingTeams((prev) => new Set(prev).add(teamId));
      try {
        const request = persistTeam(teamId);
        if (request) {
          await request;
          setSavedAt(new Date());
        }
      } catch (err) {
        // The edit stays on screen — telling the mentor it failed is more
        // use than silently reverting a row they just filled in.
        showError(err instanceof Error ? err.message : 'Could not save that row');
      } finally {
        setSavingTeams((prev) => {
          const next = new Set(prev);
          next.delete(teamId);
          return next;
        });
      }
    },
    [persistTeam, showError]
  );

  // Send whatever is still queued when this page goes away, rather than
  // dropping it. Autosave is debounced, so a mentor who picks a rating and
  // immediately hits back would otherwise lose that edit silently — no
  // error, and the indicator still reading "Saved" from a moment earlier.
  // The request is fired and not awaited: it is already on its way, and
  // there is no component left to tell about the result.
  const persistRef = useRef(persistTeam);
  persistRef.current = persistTeam;
  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      const pending = [...timers.keys()];
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      for (const teamId of pending) {
        persistRef.current(teamId)?.catch(() => {
          /* nothing left on screen to report to */
        });
      }
    };
  }, []);

  // The network call on its own, touching no React state — so it can still
  // be fired from an unmount cleanup, where setting state would be both
  // useless and a warning.

  const handleChange = useCallback(
    (change: WeeklyReportGridChange) => {
      setReport((prev) => {
        if (!prev) return prev;
        const teams = prev.teams.map((team) => {
          if (team.teamId !== change.teamId) return team;
          const next = { ...team };
          if (change.projectStatus !== undefined) next.projectStatus = change.projectStatus;
          if (change.teamHealth !== undefined) next.teamHealth = change.teamHealth;
          if (change.weeklyFeedback !== undefined) next.weeklyFeedback = change.weeklyFeedback;
          if (change.techStack !== undefined) next.techStack = change.techStack;
          if (change.student) {
            const { studentId, field, value } = change.student;
            next.students = team.students.map((s) => (s.studentId === studentId ? { ...s, [field]: value } : s));
          }
          return next;
        });
        latestTeams.current = teams;
        return { ...prev, teams };
      });

      const existing = saveTimers.current.get(change.teamId);
      if (existing) clearTimeout(existing);
      saveTimers.current.set(
        change.teamId,
        setTimeout(() => {
          saveTimers.current.delete(change.teamId);
          flushTeam(change.teamId);
        }, AUTOSAVE_DELAY_MS)
      );
    },
    [flushTeam]
  );

  const filledCount = useMemo(() => (report?.teams ?? []).filter(isTeamFilled).length, [report]);
  const isLocked = report?.assignment.status === 'approved' || report?.assignment.status === 'review';
  const canSubmit = report?.assignment.status === 'pending' || report?.assignment.status === 'resubmit';

  const handleSubmit = async () => {
    if (!taskId || !report) return;
    setSubmitting(true);
    try {
      // Anything still sitting in a debounce timer goes first — submitting
      // while the last row is queued would send the admin a report missing
      // the edit the mentor made a half-second before pressing the button.
      const pending = [...saveTimers.current.keys()];
      saveTimers.current.forEach((timer) => clearTimeout(timer));
      saveTimers.current.clear();
      await Promise.all(pending.map((teamId) => flushTeam(teamId)));

      if (report.assignment.status === 'resubmit') {
        await apiResubmitTask(taskId, report.assignment.id);
      } else {
        await apiSubmitTask(taskId, report.assignment.id);
      }
      showSuccess('Weekly report submitted');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not submit the report');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center flex-1 text-gray-500 gap-2">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading report&hellip;</span>
        </div>
      </PageLayout>
    );
  }

  if (loadError || !report) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center flex-1 gap-3">
          <p className="text-sm text-gray-400">{loadError ?? 'Report not found'}</p>
          <Button variant="secondary" size="sm" onClick={() => navigate('/mentor/dashboard/tasks')}>
            Back to tasks
          </Button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout mode="scroll" className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => navigate('/mentor/dashboard/tasks')}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ArrowLeft size={13} /> Tasks
          </button>
          <h1 className="text-xl font-semibold text-white">{report.task.title}</h1>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="text-gold font-medium">{report.task.week}</span>
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              Due {new Date(report.task.deadline).toLocaleDateString()}
            </span>
          </div>
          {report.task.description && (
            <p className="text-xs text-gray-400 max-w-2xl pt-1">{report.task.description}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-400">
              {filledCount} of {report.teams.length} teams filled
            </p>
            <p className="text-[11px] text-gray-600 h-4">
              {savingTeams.size > 0 ? (
                <span className="flex items-center justify-end gap-1">
                  <Loader2 size={10} className="animate-spin" /> Saving&hellip;
                </span>
              ) : savedAt ? (
                <span className="flex items-center justify-end gap-1 text-green-500/70">
                  <CheckCircle2 size={10} /> Saved {savedAt.toLocaleTimeString()}
                </span>
              ) : null}
            </p>
          </div>
          {canSubmit && (
            <Button onClick={handleSubmit} isLoading={submitting} disabled={submitting}>
              {report.assignment.status === 'resubmit' ? 'Resubmit report' : 'Submit report'}
            </Button>
          )}
        </div>
      </div>

      {isLocked && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            report.assignment.status === 'approved'
              ? 'border-green-500/30 bg-green-500/5 text-green-400'
              : 'border-blue-500/30 bg-blue-500/5 text-blue-300'
          }`}
        >
          {report.assignment.status === 'approved'
            ? 'Approved and locked — no further changes.'
            : 'Submitted and waiting for review. The admin can send it back if something needs changing.'}
        </div>
      )}

      <WeeklyReportSummaryStrip summary={report.summary} />

      {canSubmit && filledCount < report.teams.length && report.teams.length > 0 && (
        // A warning, not a gate: a student who was absent all week may
        // genuinely have nothing to rate, so blocking submit on a complete
        // grid would block a truthful report. The admin sees the same
        // filled/total count and can send it back.
        <p className="text-[11px] text-amber-400">
          {report.teams.length - filledCount} team(s) still blank. You can submit anyway, but the admin will see what is missing.
        </p>
      )}

      <WeeklyReportGrid teams={report.teams} readOnly={isLocked} onChange={handleChange} />
    </PageLayout>
  );
}
