import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
// EventDropArg is a core export and EventResizeDoneArg an interaction one —
// the two were imported from each other's package.
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import type { EventClickArg, DateSelectArg, EventContentArg, EventDropArg, EventHoveringArg } from '@fullcalendar/core';
import { CalendarClock, Plus, Users2, XCircle, CheckCircle2, RefreshCw, Lock, Radio, Square } from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import SessionHoverPreview from '../../components/SessionHoverPreview';
import SessionJoinLink from '../../components/SessionJoinLink';
import { useAnchoredPosition } from '../../hooks/useAnchoredPosition';
import { useCalendarBusinessHours } from '../../hooks/useCalendarBusinessHours';
import { useCalendarHolidays } from '../../hooks/useCalendarHolidays';
import { computeHolidayBackgroundEvents, localDateKey } from '../../lib/holidayCalendarEvents';
import type { Cohort } from '../../lib/types';
import {
  apiListMyCohorts,
  apiGetMySessions,
  apiCreateSession,
  apiRescheduleSession,
  apiCancelSession,
  apiCompleteSession,
  apiStartLiveSession,
  apiEndLiveSession,
  apiGetSelfSchedulePermission,
  apiGetMentorWorkspace,
  type ApiSession,
  type ApiSessionStatus,
  type ApiMentorWorkspaceTeam,
} from '../../lib/api';
import { getCohortLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';
import { useAuth } from '../../context/useAuth';

const STATUS_COLORS: Record<ApiSessionStatus, string> = {
  scheduled: '#ffcc3f',
  rescheduled: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

function toLocalInputValue(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface SessionFormState {
  teamIds: string[];
  title: string;
  locationOrLink: string;
  startLocal: string;
  endLocal: string;
}

const EMPTY_FORM: SessionFormState = { teamIds: [], title: '', locationOrLink: '', startLocal: '', endLocal: '' };

export default function MentorSessions() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState('');
  const [sessions, setSessions] = useState<ApiSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [canSelfSchedule, setCanSelfSchedule] = useState(false);

  const visibleRange = useRef<{ from: string; to: string } | null>(null);

  const [createForm, setCreateForm] = useState<SessionFormState | null>(null);
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState<ApiSession | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState<SessionFormState | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [actualMinutes, setActualMinutes] = useState('');
  const [showCompletePrompt, setShowCompletePrompt] = useState(false);
  const [deciding, setDeciding] = useState(false);

  const [hoverSession, setHoverSession] = useState<ApiSession | null>(null);
  const hoverAnchorRef = useRef<HTMLElement | null>(null);
  const hoverPosition = useAnchoredPosition(
    hoverAnchorRef,
    !!hoverSession,
    (rect) => ({ left: Math.min(rect.right + 8, window.innerWidth - 272), top: Math.min(rect.top, window.innerHeight - 180) }),
    { left: 0, top: 0 }
  );

  const businessHours = useCalendarBusinessHours(selectedCohortId, user?.id);

  const holidays = useCalendarHolidays(selectedCohortId);
  const holidayEvents = useMemo(() => computeHolidayBackgroundEvents(holidays), [holidays]);
  const holidayDateKeys = useMemo(() => new Set(holidays.map((h) => h.holiday_date.slice(0, 10))), [holidays]);
  const handleSelectAllow = useCallback(
    (span: { start: Date }) => span.start.getTime() >= Date.now() && !holidayDateKeys.has(localDateKey(span.start)),
    [holidayDateKeys]
  );

  useEffect(() => {
    apiListMyCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
  }, []);

  useEffect(() => {
    if (cohorts.length === 0) return;
    setSelectedCohortId((prev) => prev || cohorts.find((c) => c.isActive)?.id || cohorts[0]?.id || prev);
  }, [cohorts]);

  useEffect(() => {
    if (!selectedCohortId || !user) return;
    apiGetSelfSchedulePermission(selectedCohortId, user.id)
      .then(setCanSelfSchedule)
      .catch(() => setCanSelfSchedule(false));
  }, [selectedCohortId, user]);

  const loadSessions = useCallback(async () => {
    if (!selectedCohortId || !visibleRange.current) return;
    setLoading(true);
    try {
      const res = await apiGetMySessions({ cohortId: selectedCohortId, from: visibleRange.current.from, to: visibleRange.current.to, limit: 200 });
      setSessions(res.data);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [selectedCohortId, showError]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  usePageRefresh(loadSessions);

  // The same "which of my own teams can this session hold" source the admin
  // create-session picker uses (apiGetMentorWorkspace) — a mentor scheduling
  // for themself needs the same group visibility an admin scheduling on
  // their behalf gets: which group each team is in, so a whole group's teams
  // can be picked at a glance instead of hunting for them by name. The
  // Select component's own "Select All" already covers "every team".
  const [workspaceTeams, setWorkspaceTeams] = useState<ApiMentorWorkspaceTeam[]>([]);
  useEffect(() => {
    if (!selectedCohortId || !user) {
      setWorkspaceTeams([]);
      return;
    }
    apiGetMentorWorkspace(selectedCohortId, user.id)
      .then((workspace) => setWorkspaceTeams(workspace.teams))
      .catch(() => setWorkspaceTeams([]));
  }, [selectedCohortId, user]);

  const teamOptions = useMemo(
    () =>
      [...workspaceTeams]
        .sort(
          (a, b) =>
            (a.groupName ?? '￿').localeCompare(b.groupName ?? '￿') ||
            (a.name ?? '').localeCompare(b.name ?? '')
        )
        .map((t) => ({
          value: t.id,
          label: t.groupName ? `${t.name ?? `Team (${t.memberCount})`} · ${t.groupName}` : t.name ?? `Team (${t.memberCount})`,
        })),
    [workspaceTeams]
  );

  // A session is only draggable/resizable on the calendar while it's still in
  // a state a reschedule can apply to — completed/cancelled sessions are
  // rendered but locked, same restriction the backend itself enforces.
  const isEditable = (status: ApiSessionStatus) => status === 'scheduled' || status === 'rescheduled';

  const events = useMemo(
    () => [
      ...sessions.map((s) => ({
        id: s.id,
        title: s.title || s.teams.map((t) => t.team.name).join(', '),
        start: s.start_time,
        end: s.end_time,
        backgroundColor: STATUS_COLORS[s.status],
        borderColor: STATUS_COLORS[s.status],
        textColor: '#000000',
        startEditable: isEditable(s.status),
        durationEditable: isEditable(s.status),
        extendedProps: { session: s },
      })),
      ...holidayEvents,
    ],
    [sessions, holidayEvents]
  );

  // Renders a compact event card — time, title/team names — instead of
  // FullCalendar's default single-line title, matching the admin calendar's
  // richer rendering.
  const renderEventContent = useCallback((arg: EventContentArg) => {
    const session = arg.event.extendedProps.session as ApiSession | undefined;
    if (!session) return null;
    const teamNames = session.teams.map((t) => t.team.name).join(', ') || '—';
    return (
      <div className="px-1 py-0.5 overflow-hidden leading-tight">
        {arg.timeText && <div className="text-[10px] font-bold truncate">{arg.timeText}</div>}
        <div className="text-[11px] font-semibold truncate">{session.title || teamNames}</div>
        <div className="text-[10px] truncate opacity-75 flex items-center gap-1">
          <Users2 size={9} className="shrink-0" />
          {teamNames}
        </div>
      </div>
    );
  }, []);

  const applyReschedule = useCallback(
    async (session: ApiSession, start: Date, end: Date, revert: () => void) => {
      try {
        await apiRescheduleSession(session.id, {
          scheduledDate: start.toISOString().slice(0, 10),
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          title: session.title ?? undefined,
          locationOrLink: session.location_or_link ?? undefined,
        });
        showSuccess('Session rescheduled');
        loadSessions();
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to reschedule session');
        revert();
      }
    },
    [showSuccess, showError, loadSessions]
  );

  const handleEventDrop = useCallback(
    (arg: EventDropArg) => {
      const session = arg.event.extendedProps.session as ApiSession;
      if (!arg.event.start || !arg.event.end) return;
      applyReschedule(session, arg.event.start, arg.event.end, arg.revert);
    },
    [applyReschedule]
  );

  const handleEventResize = useCallback(
    (arg: EventResizeDoneArg) => {
      const session = arg.event.extendedProps.session as ApiSession;
      if (!arg.event.start || !arg.event.end) return;
      applyReschedule(session, arg.event.start, arg.event.end, arg.revert);
    },
    [applyReschedule]
  );

  const handleDatesSet = useCallback(
    (arg: { startStr: string; endStr: string }) => {
      visibleRange.current = { from: arg.startStr.slice(0, 10), to: arg.endStr.slice(0, 10) };
      loadSessions();
    },
    [loadSessions]
  );

  const handleSelect = useCallback(
    (arg: DateSelectArg) => {
      if (!canSelfSchedule) return;
      setCreateForm({ ...EMPTY_FORM, startLocal: toLocalInputValue(arg.start), endLocal: toLocalInputValue(arg.end) });
    },
    [canSelfSchedule]
  );

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const session = arg.event.extendedProps.session as ApiSession | undefined;
    if (!session) return;
    setSelected(session);
    setHoverSession(null);
  }, []);

  const handleEventMouseEnter = useCallback((arg: EventHoveringArg) => {
    const session = arg.event.extendedProps.session as ApiSession | undefined;
    if (!session) return;
    hoverAnchorRef.current = arg.el;
    setHoverSession(session);
  }, []);

  const handleEventMouseLeave = useCallback(() => {
    setHoverSession(null);
  }, []);

  const closeCreate = () => setCreateForm(null);

  const submitCreate = async () => {
    if (!createForm || !selectedCohortId || !user) return;
    if (createForm.teamIds.length === 0 || !createForm.startLocal || !createForm.endLocal) {
      showError('At least one team and a time range are required');
      return;
    }
    setCreating(true);
    try {
      const start = new Date(createForm.startLocal);
      const end = new Date(createForm.endLocal);
      await apiCreateSession({
        cohortId: selectedCohortId,
        mentorId: user.id,
        teamIds: createForm.teamIds,
        title: createForm.title || undefined,
        locationOrLink: createForm.locationOrLink || undefined,
        scheduledDate: start.toISOString().slice(0, 10),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      showSuccess('Session scheduled');
      closeCreate();
      loadSessions();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to schedule session');
    } finally {
      setCreating(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setRescheduleForm(null);
    setShowCancelPrompt(false);
    setShowCompletePrompt(false);
    setCancelReason('');
    setActualMinutes('');
  };


  // Hosting a session on the multimedia service. The ids it needs — who the
  // faculty is, which session — are the server's to supply from the token and
  // the row; nothing about them is sent from here.
  const [liveBusy, setLiveBusy] = useState(false);

  const startLive = async (session: ApiSession) => {
    setLiveBusy(true);
    try {
      const { session: updated, authToken } = await apiStartLiveSession(session.id);
      setSelected(updated);
      loadSessions();
      // Straight into the room. Starting a session and then having to find the
      // Join button is a step that exists for no reason — the room is open and
      // the host is the one who opened it.
      navigate('/live-session', {
        state: {
          authToken,
          userName: updated.mentor.full_name,
          sessionId: updated.id,
          sessionTitle: updated.title ?? undefined,
          isHost: true,
        },
      });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to start the live session');
    } finally {
      setLiveBusy(false);
    }
  };

  const endLive = async (session: ApiSession) => {
    setLiveBusy(true);
    try {
      const updated = await apiEndLiveSession(session.id);
      setSelected(updated);
      showSuccess('Live session ended.');
      loadSessions();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to end the live session');
    } finally {
      setLiveBusy(false);
    }
  };

  const beginReschedule = () => {
    if (!selected) return;
    setRescheduleForm({
      teamIds: selected.teams.map((t) => t.team_id),
      title: selected.title ?? '',
      locationOrLink: selected.location_or_link ?? '',
      startLocal: toLocalInputValue(selected.start_time),
      endLocal: toLocalInputValue(selected.end_time),
    });
  };

  const submitReschedule = async () => {
    if (!selected || !rescheduleForm) return;
    setDeciding(true);
    try {
      const start = new Date(rescheduleForm.startLocal);
      const end = new Date(rescheduleForm.endLocal);
      await apiRescheduleSession(selected.id, {
        scheduledDate: start.toISOString().slice(0, 10),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        title: rescheduleForm.title || undefined,
        locationOrLink: rescheduleForm.locationOrLink || undefined,
      });
      showSuccess('Session rescheduled');
      closeDetail();
      loadSessions();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to reschedule session');
    } finally {
      setDeciding(false);
    }
  };

  const submitCancel = async () => {
    if (!selected || !cancelReason.trim()) return;
    setDeciding(true);
    try {
      await apiCancelSession(selected.id, cancelReason.trim());
      showSuccess('Session cancelled');
      closeDetail();
      loadSessions();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to cancel session');
    } finally {
      setDeciding(false);
    }
  };

  const submitComplete = async () => {
    if (!selected) return;
    setDeciding(true);
    try {
      await apiCompleteSession(selected.id, actualMinutes ? Number(actualMinutes) : undefined);
      showSuccess('Session marked completed');
      closeDetail();
      loadSessions();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to complete session');
    } finally {
      setDeciding(false);
    }
  };

  const sessionForm = (form: SessionFormState, setForm: (f: SessionFormState) => void) => (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Team(s)</label>
        <Select isMulti value={form.teamIds} onChange={(v) => setForm({ ...form, teamIds: v })} options={teamOptions} placeholder="Select team(s)" isSearchable />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Start</label>
          <input type="datetime-local" value={form.startLocal} onChange={(e) => setForm({ ...form, startLocal: e.target.value })} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">End</label>
          <input type="datetime-local" value={form.endLocal} onChange={(e) => setForm({ ...form, endLocal: e.target.value })} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Title (optional)</label>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Location / Link (optional)</label>
        <input value={form.locationOrLink} onChange={(e) => setForm({ ...form, locationOrLink: e.target.value })} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
      </div>
    </div>
  );

  return (
    <PageLayout mode="scroll" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarClock size={24} className="text-gold" />
            My Sessions
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {canSelfSchedule ? 'Click a slot on the calendar to schedule a session.' : "You don't have self-schedule permission for this cohort yet — ask an admin to enable it."}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Select value={selectedCohortId} onChange={setSelectedCohortId} variant="filter" placeholder="Select cohort" className="w-[200px]" options={cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) }))} />
          <button
            onClick={() => canSelfSchedule && setCreateForm({ ...EMPTY_FORM })}
            disabled={!canSelfSchedule}
            title={canSelfSchedule ? undefined : 'Self-schedule permission required'}
            className="flex items-center gap-1.5 text-xs px-3 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {canSelfSchedule ? <Plus size={14} /> : <Lock size={14} />}
            Schedule Session
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap px-1">
        {(Object.entries(STATUS_COLORS) as [ApiSessionStatus, string][]).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-400 capitalize">{status}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm shrink-0 bg-red-500/40" />
          <span className="text-xs text-gray-400">Holiday</span>
        </div>
        <span className="text-xs text-gray-500 ml-auto">Drag to move · drag an edge to resize · click for details</span>
      </div>

      <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-3 relative flex-1 min-h-0 overflow-auto">
        {loading && (
          <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center rounded-xl">
            <SpinnerSquare size={40} />
          </div>
        )}
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'timeGridDay,timeGridWeek,dayGridMonth,listWeek' }}
          height="auto"
          selectable={canSelfSchedule}
          selectAllow={handleSelectAllow}
          editable
          eventDurationEditable
          eventStartEditable
          select={handleSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventMouseEnter={handleEventMouseEnter}
          eventMouseLeave={handleEventMouseLeave}
          eventContent={renderEventContent}
          events={events}
          businessHours={businessHours}
          datesSet={handleDatesSet}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          nowIndicator
          dayMaxEvents={3}
          eventDisplay="block"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', meridiem: 'short' }}
        />
        {hoverSession && (
          <SessionHoverPreview session={hoverSession} left={hoverPosition.left} top={hoverPosition.top} statusColor={STATUS_COLORS[hoverSession.status]} />
        )}
      </div>

      <Modal open={!!createForm} onClose={closeCreate} title="Schedule a Session" size="lg">
        {createForm && (
          <div className="space-y-4">
            {sessionForm(createForm, setCreateForm)}
            <div className="flex items-center gap-2 border-t border-zinc-800 pt-4">
              <button onClick={submitCreate} disabled={creating} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50">
                {creating ? 'Scheduling...' : 'Schedule'}
              </button>
              <button onClick={closeCreate} disabled={creating} className="text-xs px-3 py-1.5 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!selected} onClose={closeDetail} title={selected?.title || 'Session'} size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ backgroundColor: `${STATUS_COLORS[selected.status]}25`, color: STATUS_COLORS[selected.status] }}>
                {selected.status}
              </span>
            </div>
            <div className="space-y-2 text-sm text-gray-300">
              <p className="flex items-center gap-1.5">
                <Users2 size={14} className="text-gold" />
                {selected.teams.map((t) => t.team.name).join(', ') || '—'}
                {/* Says what kind of sitting this is in the same line as who is
                    in it, since the label is entirely a statement about that. */}
                <span className="text-xs text-gray-500">· {selected.kind_label}</span>
              </p>
              <p><span className="text-gray-500">When:</span> {new Date(selected.start_time).toLocaleString()} — {new Date(selected.end_time).toLocaleTimeString()}</p>
              {(selected.location_or_link || selected.live_session_id) && (
                <div className="flex items-center gap-1.5">
                  <SessionJoinLink session={selected} isHost userName={user?.fullName ?? user?.email} />
                </div>
              )}
              {selected.cancellation_reason && <p className="text-red-400">Cancelled: {selected.cancellation_reason}</p>}
            </div>

            {(selected.status === 'scheduled' || selected.status === 'rescheduled') && !rescheduleForm && !showCancelPrompt && !showCompletePrompt && (
              <div className="flex items-center gap-2 border-t border-zinc-800 pt-4 flex-wrap">
                {/* Hosting the session here, rather than on a pasted link.
                    Start is what creates the room; until it is pressed there is
                    nothing for anyone to join, which is why students see no
                    Join button before it. */}
                {!selected.live_session_id && (
                  <button
                    onClick={() => startLive(selected)}
                    disabled={liveBusy}
                    title="Start this session — students can join once it is live"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
                  >
                    <Radio size={14} />
                    {liveBusy ? 'Starting…' : 'Start live'}
                  </button>
                )}
                {selected.live_session_id && !selected.live_ended_at && (
                  <button
                    onClick={() => endLive(selected)}
                    disabled={liveBusy}
                    title="End the live session"
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    <Square size={14} />
                    {liveBusy ? 'Ending…' : 'End live'}
                  </button>
                )}
                <button onClick={beginReschedule} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors">
                  <RefreshCw size={14} />
                  Reschedule
                </button>
                <button onClick={() => setShowCompletePrompt(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/20 font-semibold rounded-lg hover:bg-green-500/20 transition-colors">
                  <CheckCircle2 size={14} />
                  Mark Completed
                </button>
                <button onClick={() => setShowCancelPrompt(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 font-semibold rounded-lg hover:bg-red-500/20 transition-colors">
                  <XCircle size={14} />
                  Cancel Session
                </button>
              </div>
            )}

            {rescheduleForm && (
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                {sessionForm(rescheduleForm, setRescheduleForm)}
                <div className="flex items-center gap-2">
                  <button onClick={submitReschedule} disabled={deciding} className="text-xs px-3 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50">
                    {deciding ? 'Saving...' : 'Confirm Reschedule'}
                  </button>
                  <button onClick={() => setRescheduleForm(null)} disabled={deciding} className="text-xs px-3 py-1.5 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {showCancelPrompt && (
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason for cancelling (required)"
                  rows={3}
                  autoFocus
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold resize-none"
                />
                <div className="flex items-center gap-2">
                  <button onClick={submitCancel} disabled={deciding || !cancelReason.trim()} className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 font-semibold rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50">
                    {deciding ? 'Cancelling...' : 'Confirm Cancel'}
                  </button>
                  <button onClick={() => setShowCancelPrompt(false)} disabled={deciding} className="text-xs px-3 py-1.5 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50">
                    Back
                  </button>
                </div>
              </div>
            )}

            {showCompletePrompt && (
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Actual duration in minutes (optional)</label>
                  <input type="number" min={1} value={actualMinutes} onChange={(e) => setActualMinutes(e.target.value)} className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold" />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={submitComplete} disabled={deciding} className="text-xs px-3 py-1.5 bg-green-500/10 text-green-400 border border-green-500/20 font-semibold rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50">
                    {deciding ? 'Saving...' : 'Confirm Completed'}
                  </button>
                  <button onClick={() => setShowCompletePrompt(false)} disabled={deciding} className="text-xs px-3 py-1.5 bg-zinc-750 text-gray-300 font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50">
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
