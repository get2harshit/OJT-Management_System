import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users2,
  UserPlus,
  FolderTree,
  ArrowLeftRight,
  Plus,
  CalendarClock,
  Wallet,
  Settings,
  ExternalLink,
  Briefcase,
  ClipboardList,
  ListChecks,
  Pencil,
} from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import { buildCohortOptions } from '../../lib/cohortLabel';
import { WEEKDAY_OPTIONS, formatMeetingPattern } from '../../lib/meetingPattern';
import { useToast } from '../../toast';
import { useCascadeConfirm } from '../../hooks/useCascadeConfirm';
import type { Cohort, ApiMentor, TeamAllocationDetail } from '../../lib/types';
import { RATE_TYPE_UNITS } from '../../lib/api/mentorRates';
import {
  apiListCohorts,
  apiListMentorsPage,
  apiGetMentorWorkspace,
  apiSetTeamCadence,
  apiReassignTeamMentor,
  apiMoveTeamToGroup,
  apiCreateMentorGroup,
  apiSetGroupMeetingPattern,
  apiGetTeamsForCohortDetailed,
  type ApiMentorWorkspace,
  type ApiMentorWorkspaceTeam,
  type ApiMentorGroup,
  type MeetingPattern,
} from '../../lib/api';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const CADENCE_BADGE: Record<ApiMentorWorkspaceTeam['cadenceStatus'], string> = {
  met: 'bg-green-500/10 text-green-400 border-green-500/20',
  behind: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  no_target: 'bg-zinc-800 text-gray-500 border-zinc-750',
};

/**
 * The "mentor = manager" front door: one mentor, every team currently
 * reporting to them in a cohort, at a glance — cadence (are they meeting
 * each team as often as intended), reassign / move-group actions, and links
 * out to their rate and schedule. Reassign/move-group reuse the exact same
 * backend calls CohortRosterPage's "Manage" modal uses; full membership
 * (add/remove students) still lives there rather than being rebuilt here —
 * this screen's job is the mentor-centric overview, not a second roster editor.
 */
export default function MentorWorkspace() {
  const { cohortId, mentorId } = useParams<{ cohortId: string; mentorId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const { busy: cascadeBusy, withCascadeConfirm } = useCascadeConfirm();
  const [busyOther, setBusyOther] = useState(false);
  const busy = cascadeBusy || busyOther;

  // Only for populating the "switch cohort" dropdown's options — the
  // selection itself lives in the URL (`cohortId` above), not here, so a
  // reload or a shared link always lands on the same cohort.
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [workspace, setWorkspace] = useState<ApiMentorWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [otherMentors, setOtherMentors] = useState<ApiMentor[]>([]);

  const [cadenceDrafts, setCadenceDrafts] = useState<Record<string, string>>({});
  const [reassignTeamId, setReassignTeamId] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  // Shared by both "New Group" and a group's "Edit pattern" action —
  // groupModalTarget null means creating, set means editing that group.
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupModalTarget, setGroupModalTarget] = useState<ApiMentorGroup | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [patternType, setPatternType] = useState<'' | 'weekdays' | 'interval'>('');
  const [patternWeekdays, setPatternWeekdays] = useState<string[]>([]);
  const [patternIntervalDays, setPatternIntervalDays] = useState('');
  const [patternAnchorDate, setPatternAnchorDate] = useState('');

  // "Add teams" is a reassign initiated from the destination side: pick any
  // number of teams in this cohort not already reporting to this mentor, and
  // pull them in (optionally straight into one of this mentor's groups). Same
  // backend call as the outgoing Reassign button per team, just the direction
  // is reversed. Defaults to the unassigned filter — reassigning a team away
  // from another mentor is a bigger, rarer decision and shouldn't be the
  // first thing this list shows.
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [candidateTeams, setCandidateTeams] = useState<TeamAllocationDetail[] | null>(null);
  const [addTeamFilter, setAddTeamFilter] = useState<'unassigned' | 'others'>('unassigned');
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [addTeamGroupId, setAddTeamGroupId] = useState('');
  const [addTeamReason, setAddTeamReason] = useState('');

  useEffect(() => {
    apiListCohorts()
      .then(setCohorts)
      .catch(() => setCohorts([]));
  }, []);

  const load = useCallback(async () => {
    if (!mentorId || !cohortId) return;
    setLoading(true);
    try {
      const data = await apiGetMentorWorkspace(cohortId, mentorId);
      setWorkspace(data);
      setCadenceDrafts(
        Object.fromEntries(data.teams.map((t) => [t.id, t.weeklySessionTarget != null ? String(t.weeklySessionTarget) : '']))
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load mentor workspace');
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [mentorId, cohortId, showError]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!cohortId) return;
    apiListMentorsPage({ page: 1, limit: 200, cohortId })
      .then((res) => setOtherMentors(res.data.filter((m) => m.id !== mentorId)))
      .catch(() => setOtherMentors([]));
  }, [cohortId, mentorId]);

  const cohortOptions = useMemo(() => buildCohortOptions(cohorts), [cohorts]);
  const mentorOptions = useMemo(
    () => otherMentors.map((m) => ({ value: m.id, label: m.fullName ?? m.email ?? m.id })),
    [otherMentors]
  );
  const groupOptions = useMemo(
    () => [{ value: '', label: 'Ungrouped' }, ...(workspace?.groups.map((g) => ({ value: g.id, label: g.name })) ?? [])],
    [workspace]
  );
  const currentTeamIds = useMemo(() => new Set(workspace?.teams.map((t) => t.id) ?? []), [workspace]);
  // Every team that isn't already this mentor's, split by whether it
  // currently belongs to nobody or to a different mentor — the two carry very
  // different risk, so they're separate lists rather than one flat dropdown.
  const addTeamCandidates = useMemo(
    () => (candidateTeams ?? []).filter((t) => !currentTeamIds.has(t.teamId)),
    [candidateTeams, currentTeamIds]
  );
  const unassignedAddTeamCandidates = useMemo(
    () => addTeamCandidates.filter((t) => !t.allocatedMentorId),
    [addTeamCandidates]
  );
  const otherMentorAddTeamCandidates = useMemo(
    () => addTeamCandidates.filter((t) => !!t.allocatedMentorId),
    [addTeamCandidates]
  );
  const visibleAddTeamCandidates = addTeamFilter === 'unassigned' ? unassignedAddTeamCandidates : otherMentorAddTeamCandidates;
  // "N of M teams allocated" plus up to two project titles — derived here
  // rather than sent pre-computed from the backend, since the raw
  // allocatedProjectTitle per team is already needed for the team cards below.
  const projectTitles = useMemo(
    () => [...new Set((workspace?.teams ?? []).map((t) => t.allocatedProjectTitle).filter((t): t is string => !!t))],
    [workspace]
  );
  const teamsWithProject = useMemo(() => (workspace?.teams ?? []).filter((t) => t.allocatedProjectTitle).length, [workspace]);
  const saveCadence = async (teamId: string) => {
    const raw = cadenceDrafts[teamId] ?? '';
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && (!Number.isInteger(value) || value < 1)) {
      showError('Weekly target must be a positive whole number');
      return;
    }
    setBusyOther(true);
    try {
      await apiSetTeamCadence(teamId, value);
      showSuccess('Cadence target updated');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update cadence target');
    } finally {
      setBusyOther(false);
    }
  };

  const openReassign = (teamId: string) => {
    setReassignTeamId(teamId);
    setReassignTo('');
    setReassignReason('');
  };

  const submitReassign = async () => {
    if (!reassignTeamId || !reassignTo) return;
    const mentorName = otherMentors.find((m) => m.id === reassignTo)?.fullName ?? 'the new mentor';
    await withCascadeConfirm(
      async (cascade) => {
        const result = await apiReassignTeamMentor(reassignTeamId, reassignTo, {
          reason: reassignReason.trim() || undefined,
          cascadeFutureSessions: cascade,
        });
        showSuccess(
          result.movedSessions > 0
            ? `Team reassigned to ${mentorName} — ${result.movedSessions} upcoming session${result.movedSessions === 1 ? '' : 's'} moved too`
            : `Team reassigned to ${mentorName}`
        );
        setReassignTeamId(null);
        await load();
      },
      (count) => ({
        title: 'This team has upcoming sessions',
        message: `${count} upcoming session${count === 1 ? ' is' : 's are'} still booked with you as mentor. Continuing moves ${
          count === 1 ? 'it' : 'them'
        } to ${mentorName} too. Completed sessions and their payouts are untouched.`,
        confirmLabel: 'Reassign & Move Sessions',
      })
    );
  };

  const openAddTeam = async () => {
    setAddTeamOpen(true);
    setAddTeamFilter('unassigned');
    setSelectedTeamIds([]);
    setAddTeamGroupId('');
    setAddTeamReason('');
    if (!cohortId) return;
    try {
      const res = await apiGetTeamsForCohortDetailed(cohortId, { page: 1, limit: 200 });
      setCandidateTeams(res.data);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load teams');
      setCandidateTeams([]);
    }
  };

  const toggleAddTeamSelection = (teamId: string) => {
    setSelectedTeamIds((prev) => (prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]));
  };

  // One reassign call per selected team — there's no bulk-reassign endpoint,
  // and each team can independently hit the future-sessions cascade check, so
  // each gets its own confirm rather than one prompt trying to speak for all
  // of them. A decline on one team just skips it; the rest still proceed.
  const submitAddTeam = async () => {
    if (!mentorId || selectedTeamIds.length === 0) return;
    setBusyOther(true);
    let addedCount = 0;
    let movedSessionsTotal = 0;
    for (const teamId of selectedTeamIds) {
      const teamName = candidateTeams?.find((t) => t.teamId === teamId)?.teamName ?? 'A team';
      await withCascadeConfirm(
        async (cascade) => {
          const result = await apiReassignTeamMentor(teamId, mentorId, {
            reason: addTeamReason.trim() || undefined,
            cascadeFutureSessions: cascade,
          });
          if (addTeamGroupId) {
            await apiMoveTeamToGroup(teamId, addTeamGroupId);
          }
          addedCount += 1;
          movedSessionsTotal += result.movedSessions;
        },
        (count) => ({
          title: `${teamName} has upcoming sessions`,
          message: `${count} upcoming session${count === 1 ? ' is' : 's are'} still booked with its current mentor. Continuing moves ${
            count === 1 ? 'it' : 'them'
          } here too. Completed sessions and their payouts are untouched.`,
          confirmLabel: 'Add & Move Sessions',
        })
      );
    }
    setBusyOther(false);
    if (addedCount > 0) {
      showSuccess(
        `${addedCount} team${addedCount === 1 ? '' : 's'} added${
          movedSessionsTotal > 0 ? ` — ${movedSessionsTotal} upcoming session${movedSessionsTotal === 1 ? '' : 's'} moved too` : ''
        }`
      );
      setAddTeamOpen(false);
      await load();
    }
  };

  const moveGroup = async (teamId: string, groupId: string) => {
    setBusyOther(true);
    try {
      await apiMoveTeamToGroup(teamId, groupId || null);
      showSuccess(groupId ? 'Team moved to the group' : 'Team ungrouped');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to move team');
    } finally {
      setBusyOther(false);
    }
  };

  const openCreateGroup = () => {
    setGroupModalTarget(null);
    setGroupNameDraft('');
    setPatternType('');
    setPatternWeekdays([]);
    setPatternIntervalDays('');
    setPatternAnchorDate('');
    setGroupModalOpen(true);
  };

  const openEditPattern = (group: ApiMentorGroup) => {
    setGroupModalTarget(group);
    setGroupNameDraft(group.name);
    setPatternType(group.meeting_pattern_type ?? '');
    setPatternWeekdays(group.meeting_weekdays.map(String));
    setPatternIntervalDays(group.meeting_interval_days != null ? String(group.meeting_interval_days) : '');
    setPatternAnchorDate(group.meeting_interval_anchor ? group.meeting_interval_anchor.slice(0, 10) : '');
    setGroupModalOpen(true);
  };

  const buildPatternFromDraft = (): MeetingPattern => {
    if (patternType === 'weekdays') {
      if (patternWeekdays.length === 0) return null;
      return { type: 'weekdays', weekdays: patternWeekdays.map(Number) };
    }
    if (patternType === 'interval') {
      const days = Number(patternIntervalDays);
      if (!patternIntervalDays || !patternAnchorDate || !Number.isInteger(days) || days < 1) return null;
      return { type: 'interval', intervalDays: days, anchorDate: patternAnchorDate };
    }
    return null;
  };

  const submitGroupModal = async () => {
    if (!cohortId || !mentorId) return;
    const pattern = buildPatternFromDraft();
    setBusyOther(true);
    try {
      if (groupModalTarget) {
        await apiSetGroupMeetingPattern(cohortId, mentorId, groupModalTarget.id, pattern);
        showSuccess('Group updated');
      } else {
        if (!groupNameDraft.trim()) {
          showError('Group name is required');
          setBusyOther(false);
          return;
        }
        await apiCreateMentorGroup(cohortId, mentorId, groupNameDraft.trim(), pattern);
        showSuccess('Group created');
      }
      setGroupModalOpen(false);
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save group');
    } finally {
      setBusyOther(false);
    }
  };

  // Seeded from workspace.groups first, so a just-created empty group still
  // shows up as its own (empty) section — otherwise it exists only inside
  // each team's "Move to group" dropdown, and creating one would look like
  // it did nothing. Ungrouped always renders last, whether or not it's empty.
  const teamsByGroup = useMemo(() => {
    const buckets = new Map<string, ApiMentorWorkspaceTeam[]>();
    for (const g of workspace?.groups ?? []) buckets.set(g.id, []);
    for (const t of workspace?.teams ?? []) {
      const key = t.groupId ?? '__ungrouped__';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(t);
    }
    const ungrouped = buckets.get('__ungrouped__') ?? [];
    buckets.delete('__ungrouped__');
    buckets.set('__ungrouped__', ungrouped);
    return buckets;
  }, [workspace]);

  return (
    <PageLayout mode="scroll" className="space-y-6">
      <div>
        <button
          onClick={() => navigate('/admin/dashboard/mentors')}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gold mb-2 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Mentors
        </button>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">{workspace?.mentor.full_name ?? 'Mentor Workspace'}</h1>
            <p className="text-sm text-gray-400">{workspace?.mentor.email}</p>
          </div>
          <div className="w-64">
            <Select
              value={cohortId ?? ''}
              onChange={(newCohortId) => navigate(`/admin/dashboard/ojts/${newCohortId}/mentors/${mentorId}`, { replace: true })}
              options={cohortOptions}
              placeholder="Select cohort"
              isSearchable
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : !workspace ? (
        <p className="text-gray-500 text-sm">No data for this mentor in this cohort.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4 flex items-start gap-3">
              <Wallet size={16} className="text-gold shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Rate</p>
                <p className="text-sm text-white">
                  {workspace.rate
                    ? `${workspace.rate.currency} ${workspace.rate.amount} ${RATE_TYPE_UNITS[workspace.rate.type as keyof typeof RATE_TYPE_UNITS] ?? ''}`
                    : 'Not set'}
                </p>
                <button
                  onClick={() => navigate(`/admin/dashboard/payouts?mentorId=${mentorId}`)}
                  className="flex items-center gap-1 text-[11px] text-gold hover:underline mt-1"
                >
                  View this mentor's payouts <ExternalLink size={11} />
                </button>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4 flex items-start gap-3">
              <CalendarClock size={16} className="text-gold shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Schedule</p>
                <p className="text-sm text-white">
                  {workspace.scheduleOverride
                    ? `${workspace.scheduleOverride.workingDays.map((d) => DAY_LABELS[d]).join(', ')} · ${minutesToTime(
                        workspace.scheduleOverride.dayStartMinute
                      )}-${minutesToTime(workspace.scheduleOverride.dayEndMinute)}`
                    : 'Follows cohort default'}
                </p>
                <button
                  onClick={() => navigate('/admin/dashboard/sessions/config')}
                  className="flex items-center gap-1 text-[11px] text-gold hover:underline mt-1"
                >
                  Manage on Scheduling Config <ExternalLink size={11} />
                </button>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4 flex items-start gap-3">
              <Settings size={16} className="text-gold shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Self-schedule</p>
                <p className="text-sm text-white">{workspace.selfScheduleAllowed ? 'Allowed' : 'Not allowed'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4 flex items-start gap-3">
              <Briefcase size={16} className="text-gold shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Projects</p>
                <p className="text-sm text-white">
                  {teamsWithProject} of {workspace.teams.length} team{workspace.teams.length === 1 ? '' : 's'} allocated
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {projectTitles.length > 0
                    ? `${projectTitles.slice(0, 2).join(' · ')}${projectTitles.length > 2 ? ` · +${projectTitles.length - 2} more` : ''}`
                    : 'No projects allocated yet'}
                </p>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4 flex items-start gap-3">
              <ClipboardList size={16} className="text-gold shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Submissions</p>
                <p className="text-sm text-white">
                  {workspace.submissions.pending > 0 ? (
                    <span className="text-amber-400">{workspace.submissions.pending} pending review</span>
                  ) : (
                    'Nothing pending'
                  )}
                  {' · '}
                  {workspace.submissions.reviewed} reviewed
                </p>
                <button
                  onClick={() => navigate(`/admin/dashboard/submissions?cohortId=${cohortId}&mentorId=${mentorId}`)}
                  className="flex items-center gap-1 text-[11px] text-gold hover:underline mt-1"
                >
                  Open in Submissions <ExternalLink size={11} />
                </button>
              </div>
            </div>
            <div className="bg-zinc-900 border border-zinc-750 rounded-lg p-4 flex items-start gap-3">
              <ListChecks size={16} className="text-gold shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-gray-500">Tasks</p>
                <p className="text-sm text-white">
                  {workspace.tasksAssignedCount} created by this mentor
                </p>
                <button
                  onClick={() => navigate(`/admin/dashboard/tasks?cohortId=${cohortId}&assignedById=${mentorId}`)}
                  className="flex items-center gap-1 text-[11px] text-gold hover:underline mt-1"
                >
                  Open in Tasks <ExternalLink size={11} />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {[...teamsByGroup.entries()].map(([groupKey, teams]) => {
              const group = workspace.groups.find((g) => g.id === groupKey);
              return (
                <div key={groupKey} className="space-y-2">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-300">
                    <FolderTree size={14} className="text-gold" />
                    {group ? group.name : 'Ungrouped'}
                    <span className="text-xs text-gray-500 font-normal">
                      ({teams.length} team{teams.length === 1 ? '' : 's'})
                    </span>
                    {group && formatMeetingPattern(group) && (
                      <span className="text-[11px] text-gray-500 font-normal">· {formatMeetingPattern(group)}</span>
                    )}
                    {group && (
                      <button
                        onClick={() => openEditPattern(group)}
                        title="Edit meeting pattern"
                        className="text-gray-500 hover:text-gold transition-colors"
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                  </h2>
                  {teams.length === 0 ? (
                    <p className="text-xs text-gray-500 pl-5">No teams here yet — move one in from another group below.</p>
                  ) : (
                  <div className="space-y-2">
                    {teams.map((t) => (
                      <div
                        key={t.id}
                        className="bg-zinc-900 border border-zinc-750 rounded-lg p-3 flex items-center justify-between gap-4 flex-wrap"
                      >
                        <div className="flex items-center gap-2 min-w-[160px]">
                          <Users2 size={14} className="text-gold shrink-0" />
                          <div>
                            <p className="text-sm text-white">{t.name || 'Team'}</p>
                            <p className="text-[11px] text-gray-500">
                              {t.memberCount} member{t.memberCount === 1 ? '' : 's'}
                              {t.allocatedProjectTitle ? ` · ${t.allocatedProjectTitle}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-gray-500">Weekly target</label>
                          <input
                            type="number"
                            min={1}
                            value={cadenceDrafts[t.id] ?? ''}
                            onChange={(e) => setCadenceDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))}
                            placeholder="—"
                            className="w-16 bg-zinc-800 border border-zinc-750 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-gold"
                          />
                          <button
                            onClick={() => saveCadence(t.id)}
                            disabled={busy}
                            className="text-[11px] px-2 py-1 bg-zinc-750 text-gold rounded hover:bg-zinc-700 transition-colors disabled:opacity-50"
                          >
                            Save
                          </button>
                          <span className={`text-[11px] px-2 py-1 rounded border ${CADENCE_BADGE[t.cadenceStatus]}`}>
                            {t.cadenceStatus === 'no_target'
                              ? 'No target'
                              : `${t.sessionsThisWeek}/${t.weeklySessionTarget} this week — ${t.cadenceStatus === 'met' ? 'Met' : 'Behind'}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-36">
                            <Select
                              value={t.groupId ?? ''}
                              onChange={(v) => moveGroup(t.id, v)}
                              options={groupOptions}
                              placeholder="Move to group"
                            />
                          </div>
                          <button
                            onClick={() => openReassign(t.id)}
                            disabled={busy}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-zinc-750 text-gold rounded hover:bg-zinc-700 transition-colors disabled:opacity-50"
                          >
                            <ArrowLeftRight size={12} />
                            Reassign
                          </button>
                          <button
                            onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/teams`)}
                            className="text-[11px] text-gray-400 hover:text-white transition-colors"
                          >
                            Manage members →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              );
            })}

            <div className="flex items-center gap-2 border-t border-zinc-800 pt-4 flex-wrap">
              <button
                onClick={openCreateGroup}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs px-3 py-2 bg-zinc-750 text-gold font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                <Plus size={14} />
                New Group
              </button>
              <button
                onClick={openAddTeam}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs px-3 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
              >
                <UserPlus size={14} />
                Add Team
              </button>
            </div>
          </div>
        </>
      )}

      {addTeamOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setAddTeamOpen(false)}>
          <div
            className="bg-zinc-900 border border-zinc-750 rounded-xl p-5 w-full max-w-md space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold text-sm">Add Teams</h3>
            <p className="text-xs text-gray-500">
              Pick one or more teams — this moves each one (and its mentor) here, same as Reassign, just started from this side.
            </p>

            <div className="flex gap-2 text-xs">
              <button
                onClick={() => setAddTeamFilter('unassigned')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  addTeamFilter === 'unassigned' ? 'bg-gold text-black' : 'bg-zinc-800 text-gray-400 hover:text-white'
                }`}
              >
                Unassigned ({unassignedAddTeamCandidates.length})
              </button>
              <button
                onClick={() => setAddTeamFilter('others')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                  addTeamFilter === 'others' ? 'bg-gold text-black' : 'bg-zinc-800 text-gray-400 hover:text-white'
                }`}
              >
                Other mentors' teams ({otherMentorAddTeamCandidates.length})
              </button>
            </div>

            {addTeamFilter === 'others' && (
              <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                These are not your teams — adding one reassigns it away from its current mentor.
              </p>
            )}

            <div className="max-h-52 overflow-y-auto border border-zinc-750 rounded-lg divide-y divide-zinc-800">
              {candidateTeams === null ? (
                <p className="text-xs text-gray-500 px-3 py-3">Loading teams…</p>
              ) : visibleAddTeamCandidates.length === 0 ? (
                <p className="text-xs text-gray-500 px-3 py-3">
                  {addTeamFilter === 'unassigned' ? 'No unassigned teams in this cohort.' : 'No other teams in this cohort.'}
                </p>
              ) : (
                visibleAddTeamCandidates.map((t) => (
                  <label
                    key={t.teamId}
                    className="flex items-center gap-2.5 px-3 py-2 text-xs cursor-pointer hover:bg-zinc-800 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTeamIds.includes(t.teamId)}
                      onChange={() => toggleAddTeamSelection(t.teamId)}
                      className="accent-gold w-4 h-4 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-white truncate">{t.teamName || 'Team'}</p>
                      {t.allocatedMentorName && (
                        <p className="text-[10px] text-amber-400 truncate">Not your team — currently with {t.allocatedMentorName}</p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Group (optional)</label>
              <Select value={addTeamGroupId} onChange={setAddTeamGroupId} options={groupOptions} placeholder="Ungrouped" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Reason (optional)</label>
              <input
                value={addTeamReason}
                onChange={(e) => setAddTeamReason(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setAddTeamOpen(false)}
                className="text-xs px-3 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitAddTeam}
                disabled={busy || selectedTeamIds.length === 0}
                className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
              >
                Add {selectedTeamIds.length > 0 ? `${selectedTeamIds.length} ` : ''}Team{selectedTeamIds.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {reassignTeamId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setReassignTeamId(null)}>
          <div
            className="bg-zinc-900 border border-zinc-750 rounded-xl p-5 w-full max-w-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold text-sm">Reassign Team</h3>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">New mentor</label>
              <Select value={reassignTo} onChange={setReassignTo} options={mentorOptions} placeholder="Select mentor" isSearchable />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Reason (optional)</label>
              <input
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setReassignTeamId(null)}
                className="text-xs px-3 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitReassign}
                disabled={busy || !reassignTo}
                className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
              >
                Reassign
              </button>
            </div>
          </div>
        </div>
      )}

      {groupModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setGroupModalOpen(false)}>
          <div
            className="bg-zinc-900 border border-zinc-750 rounded-xl p-5 w-full max-w-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold text-sm">{groupModalTarget ? 'Edit Meeting Pattern' : 'New Group'}</h3>
            {!groupModalTarget && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Group name</label>
                <input
                  value={groupNameDraft}
                  onChange={(e) => setGroupNameDraft(e.target.value)}
                  placeholder="e.g. Batch 1"
                  className="w-full bg-zinc-800 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Meeting pattern (optional)</label>
              <p className="text-[11px] text-gray-500 mb-2">
                Only a default for cadence tracking and scheduling suggestions — nothing gets scheduled automatically.
              </p>
              <Select
                value={patternType}
                onChange={(v) => setPatternType(v as '' | 'weekdays' | 'interval')}
                options={[
                  { value: '', label: 'No pattern' },
                  { value: 'weekdays', label: 'Specific days of the week' },
                  { value: 'interval', label: 'Every N days' },
                ]}
              />
            </div>
            {patternType === 'weekdays' && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Days</label>
                <Select isMulti value={patternWeekdays} onChange={setPatternWeekdays} options={WEEKDAY_OPTIONS} placeholder="Select days" />
              </div>
            )}
            {patternType === 'interval' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">Every N days</label>
                  <input
                    type="number"
                    min={1}
                    value={patternIntervalDays}
                    onChange={(e) => setPatternIntervalDays(e.target.value)}
                    placeholder="e.g. 2"
                    className="w-full bg-zinc-800 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">Starting from</label>
                  <input
                    type="date"
                    value={patternAnchorDate}
                    onChange={(e) => setPatternAnchorDate(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setGroupModalOpen(false)}
                className="text-xs px-3 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitGroupModal}
                disabled={busy || (!groupModalTarget && !groupNameDraft.trim())}
                className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
              >
                {groupModalTarget ? 'Save' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
