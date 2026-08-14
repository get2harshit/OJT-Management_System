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
} from 'lucide-react';
import PageLayout from '../../components/PageLayout';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import { getCohortLabel } from '../../lib/cohortLabel';
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
  apiGetTeamsForCohortDetailed,
  type ApiMentorWorkspace,
  type ApiMentorWorkspaceTeam,
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
  const [newGroupName, setNewGroupName] = useState('');

  // "Add a team" is a reassign initiated from the destination side: pick any
  // team in this cohort not already reporting to this mentor, and pull it in
  // (optionally straight into one of this mentor's groups). Same backend
  // call as the outgoing Reassign button, just the direction is reversed.
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [candidateTeams, setCandidateTeams] = useState<TeamAllocationDetail[] | null>(null);
  const [addTeamId, setAddTeamId] = useState('');
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

  const cohortOptions = useMemo(() => cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) })), [cohorts]);
  const mentorOptions = useMemo(
    () => otherMentors.map((m) => ({ value: m.id, label: m.fullName ?? m.email ?? m.id })),
    [otherMentors]
  );
  const groupOptions = useMemo(
    () => [{ value: '', label: 'Ungrouped' }, ...(workspace?.groups.map((g) => ({ value: g.id, label: g.name })) ?? [])],
    [workspace]
  );
  const currentTeamIds = useMemo(() => new Set(workspace?.teams.map((t) => t.id) ?? []), [workspace]);
  const candidateTeamOptions = useMemo(
    () =>
      (candidateTeams ?? [])
        .filter((t) => !currentTeamIds.has(t.teamId))
        .map((t) => ({
          value: t.teamId,
          label: `${t.teamName || 'Team'}${t.allocatedMentorName ? ` — currently ${t.allocatedMentorName}` : ''}`,
        })),
    [candidateTeams, currentTeamIds]
  );

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
    setAddTeamId('');
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

  const submitAddTeam = async () => {
    if (!mentorId || !addTeamId) return;
    const teamName = candidateTeams?.find((t) => t.teamId === addTeamId)?.teamName ?? 'The team';
    await withCascadeConfirm(
      async (cascade) => {
        const result = await apiReassignTeamMentor(addTeamId, mentorId, {
          reason: addTeamReason.trim() || undefined,
          cascadeFutureSessions: cascade,
        });
        if (addTeamGroupId) {
          await apiMoveTeamToGroup(addTeamId, addTeamGroupId);
        }
        showSuccess(
          result.movedSessions > 0
            ? `${teamName} added — ${result.movedSessions} upcoming session${result.movedSessions === 1 ? '' : 's'} moved too`
            : `${teamName} added`
        );
        setAddTeamOpen(false);
        await load();
      },
      (count) => ({
        title: 'This team has upcoming sessions',
        message: `${count} upcoming session${count === 1 ? ' is' : 's are'} still booked with its current mentor. Continuing moves ${
          count === 1 ? 'it' : 'them'
        } here too. Completed sessions and their payouts are untouched.`,
        confirmLabel: 'Add & Move Sessions',
      })
    );
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

  const createGroup = async () => {
    if (!cohortId || !mentorId || !newGroupName.trim()) return;
    setBusyOther(true);
    try {
      await apiCreateMentorGroup(cohortId, mentorId, newGroupName.trim());
      setNewGroupName('');
      showSuccess('Group created');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create group');
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
                            onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/roster`)}
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
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="New group name"
                className="flex-1 max-w-xs bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
              />
              <button
                onClick={createGroup}
                disabled={busy || !newGroupName.trim()}
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
            className="bg-zinc-900 border border-zinc-750 rounded-xl p-5 w-full max-w-sm space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-semibold text-sm">Add a Team</h3>
            <p className="text-xs text-gray-500">
              Pick any team in this OJT — this moves it (and its mentor) here, same as Reassign, just started from this side.
            </p>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Team</label>
              <Select
                value={addTeamId}
                onChange={setAddTeamId}
                options={candidateTeamOptions}
                placeholder={candidateTeams === null ? 'Loading teams…' : 'Select team'}
                isSearchable
              />
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
                disabled={busy || !addTeamId}
                className="text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
              >
                Add Team
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
    </PageLayout>
  );
}
