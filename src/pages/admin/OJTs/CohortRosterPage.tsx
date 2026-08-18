import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Users2, UserPlus, UserMinus, ArrowLeftRight, FolderTree, Plus, AlertTriangle, Trash2 } from 'lucide-react';
import PageLayout from '../../../components/PageLayout';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import type { TeamAllocationDetail, ApiMentor, ApiStudent } from '../../../lib/types';
import {
  apiGetTeamsForCohortDetailed,
  apiListMentorsPage,
  apiListStudentsPage,
  apiAddTeamMember,
  apiRemoveTeamMember,
  apiReassignTeamMentor,
  apiMoveTeamToGroup,
  apiListMentorGroups,
  apiCreateMentorGroup,
  apiGetTeamRosterMentor,
  apiBreakTeam,
  type ApiMentorGroup,
  type ApiTeamRosterMentor,
} from '../../../lib/api';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';
import { usePageRefresh } from '../../../context/RefreshContext';
import { useCascadeConfirm } from '../../../hooks/useCascadeConfirm';

type ManageTab = 'members' | 'mentor' | 'group' | 'break';

/**
 * Admin's single home for a cohort's teams: the full picture (mentor,
 * project, allocation, group, track) plus every action on a team — who's on
 * it, which mentor owns it, which of that mentor's groups it's filed under,
 * and breaking it entirely. Used to be two pages (a view-only Teams tab and
 * a separate Roster & Mentors screen reached from a button on it) — merged
 * here since almost every real visit needed both.
 *
 * The four operations differ in how dangerous they are, and the UI keeps
 * that distinction visible rather than flattening it:
 *   - moving a team between groups is purely organisational and just happens;
 *   - removing a student, or changing a team's mentor, can disturb sessions
 *     already on the calendar. The backend refuses those with a 409 listing
 *     how many upcoming sessions are affected, and this page turns that
 *     refusal into an explicit confirmation rather than retrying silently;
 *   - breaking the team is the most destructive of all (every member drops
 *     back to the teammate-invite step) and gets its own tab rather than
 *     living beside the view-only list, so it's never one misclick away.
 * Sessions already completed are never touched by any of it.
 */
export default function CohortRosterPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();
  const { busy: cascadeBusy, withCascadeConfirm } = useCascadeConfirm();
  // Separate from the cascade-confirm hook's busy flag — these three actions
  // (add member, move group, create group) never hit a 409 conflict, so they
  // never go through that hook at all.
  const [busyOther, setBusyOther] = useState(false);
  const busy = cascadeBusy || busyOther;

  const [teams, setTeams] = useState<TeamAllocationDetail[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [students, setStudents] = useState<ApiStudent[]>([]);

  const [manageTeam, setManageTeam] = useState<TeamAllocationDetail | null>(null);
  const [manageTab, setManageTab] = useState<ManageTab>('members');
  const [breakingTeamId, setBreakingTeamId] = useState<string | null>(null);

  const [addStudentId, setAddStudentId] = useState('');
  const [newMentorId, setNewMentorId] = useState('');
  const [changeReason, setChangeReason] = useState('');

  const [groups, setGroups] = useState<ApiMentorGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  // Resolved per team when the modal opens — see apiGetTeamRosterMentor for
  // why this can't just reuse the list's allocatedMentorId.
  const [rosterMentor, setRosterMentor] = useState<ApiTeamRosterMentor | null>(null);

  const load = useCallback(
    async (page = 1, limit = pagination.limit, searchTerm = search) => {
      if (!cohortId) return;
      setLoading(true);
      try {
        const res = await apiGetTeamsForCohortDetailed(cohortId, { page, limit, search: searchTerm || undefined });
        setTeams(res.data);
        setPagination(res.pagination);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to load teams');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cohortId, showError]
  );

  useEffect(() => {
    if (!cohortId) return;
    load(1, pagination.limit, '');
    apiListMentorsPage({ page: 1, limit: 200, cohortId })
      .then((res) => setMentors(res.data))
      .catch(() => setMentors([]));
    // Cohort-scoped: only students actually mapped to this cohort can join one
    // of its teams, so offering the whole institution roster would just invite
    // an error from the backend.
    apiListStudentsPage({ page: 1, limit: 500, cohortId })
      .then((res) => setStudents(res.data))
      .catch(() => setStudents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  usePageRefresh(() => load(pagination.page, pagination.limit, search));

  const openManage = async (team: TeamAllocationDetail) => {
    setManageTeam(team);
    setManageTab('members');
    setAddStudentId('');
    setNewMentorId('');
    setChangeReason('');
    setNewGroupName('');
    setGroups([]);
    setRosterMentor(null);
    try {
      const current = await apiGetTeamRosterMentor(team.teamId);
      setRosterMentor(current);
      if (cohortId && current.mentorId) {
        setGroups(await apiListMentorGroups(cohortId, current.mentorId));
      }
    } catch {
      // Groups and the resolved mentor are context for two of the three tabs
      // — failing to load them shouldn't block the member work the admin may
      // have opened this for.
    }
  };

  const refreshAfterChange = async () => {
    await load(pagination.page, pagination.limit, search);
    setManageTeam(null);
  };

  const addMember = async () => {
    if (!manageTeam || !addStudentId) return;
    setBusyOther(true);
    try {
      await apiAddTeamMember(manageTeam.teamId, addStudentId);
      showSuccess('Student added to the team');
      await refreshAfterChange();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add student');
    } finally {
      setBusyOther(false);
    }
  };

  const removeMember = async (studentId: string, studentName: string) => {
    if (!manageTeam) return;
    await withCascadeConfirm(
      async (cascade) => {
        await apiRemoveTeamMember(manageTeam.teamId, studentId, {
          reason: changeReason.trim() || undefined,
          cascadeFutureSessions: cascade,
        });
        showSuccess(`${studentName} removed from the team`);
        await refreshAfterChange();
      },
      (count) => ({
        title: 'This team has upcoming sessions',
        message: `${studentName} is expected at ${count} upcoming session${
          count === 1 ? '' : 's'
        }. Removing them now marks their attendance on those as excused — the sessions themselves stay, and past sessions are untouched.`,
        confirmLabel: 'Remove Anyway',
      })
    );
  };

  const reassignMentor = async () => {
    if (!manageTeam || !newMentorId) return;
    const mentorName = mentors.find((m) => m.id === newMentorId)?.fullName ?? 'the new mentor';
    await withCascadeConfirm(
      async (cascade) => {
        const result = await apiReassignTeamMentor(manageTeam.teamId, newMentorId, {
          reason: changeReason.trim() || undefined,
          cascadeFutureSessions: cascade,
        });
        showSuccess(
          result.movedSessions > 0
            ? `Mentor changed — ${result.movedSessions} upcoming session${result.movedSessions === 1 ? '' : 's'} moved too`
            : 'Mentor changed'
        );
        await refreshAfterChange();
      },
      (count) => ({
        title: 'This team has upcoming sessions',
        message: `${count} upcoming session${count === 1 ? ' is' : 's are'} still booked with the current mentor. Continuing moves ${
          count === 1 ? 'it' : 'them'
        } to ${mentorName} and re-snapshots the rate. Completed sessions and their payouts are untouched.`,
        confirmLabel: 'Reassign & Move Sessions',
      })
    );
  };

  const moveToGroup = async (groupId: string | null) => {
    if (!manageTeam) return;
    setBusyOther(true);
    try {
      await apiMoveTeamToGroup(manageTeam.teamId, groupId, changeReason.trim() || undefined);
      showSuccess(groupId ? 'Team moved to the group' : 'Team ungrouped');
      await refreshAfterChange();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to move team');
    } finally {
      setBusyOther(false);
    }
  };

  const createGroup = async () => {
    if (!cohortId || !rosterMentor?.mentorId || !newGroupName.trim()) return;
    setBusyOther(true);
    try {
      const group = await apiCreateMentorGroup(cohortId, rosterMentor.mentorId, newGroupName.trim());
      setGroups((prev) => [...prev, group]);
      setNewGroupName('');
      showSuccess(`Group "${group.name}" created`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setBusyOther(false);
    }
  };

  const breakTeam = async () => {
    if (!manageTeam) return;
    const memberNames = manageTeam.members.map((m) => m.fullName || m.studentId).join(', ');
    const confirmBreak = await confirm({
      title: 'Break team',
      message: `Break this team (${memberNames})? Members will drop back to the teammate-invite step. This cannot be undone.`,
      confirmLabel: 'Break Team',
      variant: 'danger',
    });
    if (!confirmBreak) return;

    setBreakingTeamId(manageTeam.teamId);
    await withCascadeConfirm(
      async (cascade) => {
        await apiBreakTeam(manageTeam.teamId, { reason: changeReason.trim() || undefined, cascadeFutureSessions: cascade });
        showSuccess('Team disbanded successfully!');
        await refreshAfterChange();
      },
      (count) => ({
        title: 'Team has upcoming sessions',
        message: `This team has ${count} upcoming session(s). Breaking it will cancel any session scheduled only for this team, and drop this team from any session it shares with another team. Continue?`,
        confirmLabel: 'Break Team Anyway',
      })
    );
    setBreakingTeamId(null);
  };

  // Students already on any team in the loaded page are filtered out — the
  // backend rejects a double-membership anyway, so offering it is a trap.
  const takenStudentIds = useMemo(
    () => new Set(teams.flatMap((t) => t.members.map((m) => m.studentId))),
    [teams]
  );
  const studentOptions = useMemo(
    () =>
      students
        .filter((s) => !takenStudentIds.has(s.id))
        .map((s) => ({ value: s.id, label: s.fullName ?? s.email ?? s.id })),
    [students, takenStudentIds]
  );
  const mentorOptions = useMemo(
    () =>
      mentors
        .filter((m) => m.id !== rosterMentor?.mentorId)
        .map((m) => ({ value: m.id, label: m.fullName ?? m.email ?? m.id })),
    [mentors, rosterMentor]
  );

  const tableRows = teams.map((t) => ({
    ...t,
    id: t.teamId,
    memberNames: t.members.map((m) => m.fullName ?? m.studentId).join(', '),
    mentorName: t.allocatedMentorName ?? '—',
  }));

  return (
    <PageLayout className="space-y-6">
      <DataTable
        columns={[
          {
            key: 'memberNames',
            header: 'Members',
            render: (row) => (
              <div className="flex items-start gap-2">
                <Users2 size={14} className="text-gold shrink-0 mt-0.5" />
                <div>
                  <div>{row.memberNames || '—'}</div>
                  <div className="text-[11px] text-gray-500">{row.members.map((m) => m.rollNumber ?? '—').join(' · ')}</div>
                </div>
              </div>
            ),
          },
          {
            key: 'isIndividual',
            header: 'Type',
            render: (row) => (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                row.isIndividual ? 'bg-blue-400/10 text-blue-400' : 'bg-purple-400/10 text-purple-400'
              }`}>
                {row.isIndividual ? 'Individual' : 'Paired'}
              </span>
            ),
          },
          { key: 'mentorName', header: 'Mentor', render: (row) => row.allocatedMentorName ?? <span className="text-gray-500">Not allocated</span> },
          {
            key: 'allocatedProjectTitle',
            header: 'Project',
            render: (row) => row.allocatedProjectTitle ?? <span className="text-gray-500">—</span>,
          },
          {
            key: 'preferences',
            header: 'Preferences',
            render: (row) => (
              <div className="text-xs space-y-0.5 max-w-[220px]">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-gray-500 shrink-0">P1</span>
                  <span className="truncate">{row.preference1?.projectTitle ?? '—'}</span>
                  {row.preference1ReviewStatus === 'pending_review' && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 text-[10px] font-semibold">Pending review</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 truncate text-gray-400">
                  <span className="text-gray-500 shrink-0">P2</span>
                  <span className="truncate">{row.preference2?.projectTitle ?? '—'}</span>
                </div>
              </div>
            ),
          },
          {
            key: 'allocationStatus',
            header: 'Allocation',
            render: (row) => {
              const styles: Record<string, string> = {
                allocated: 'bg-green-400/10 text-green-400',
                needs_review: 'bg-amber-400/10 text-amber-400',
                pending: 'bg-gray-400/10 text-gray-400',
              };
              return (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${styles[row.allocationStatus] ?? styles.pending}`}>
                  {row.allocationStatus.replace('_', ' ')}
                </span>
              );
            },
          },
          {
            key: 'groupName',
            header: 'Group',
            render: (row) =>
              row.groupName ? (
                <span className="inline-flex items-center gap-1 text-xs text-gray-300 bg-zinc-800 border border-zinc-750 px-2 py-0.5 rounded-md">{row.groupName}</span>
              ) : (
                <span className="text-gray-500 text-xs">Ungrouped</span>
              ),
          },
          { key: 'track', header: 'Track' },
        ]}
        data={tableRows}
        searchPlaceholder="Search teams or students..."
        loading={loading}
        hideExport
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          totalPages: pagination.totalPages,
          total: pagination.total,
          onPageChange: (page) => load(page, pagination.limit, search),
          onLimitChange: (limit) => load(1, limit, search),
        }}
        onSearchChange={(value) => {
          setSearch(value);
          load(1, pagination.limit, value);
        }}
        actions={(row) => (
          <button
            onClick={() => openManage(row)}
            className="p-1 px-2.5 bg-zinc-750 hover:bg-zinc-700 text-gold text-xs font-semibold rounded transition-all"
          >
            Manage
          </button>
        )}
      />

      <Modal open={!!manageTeam} onClose={() => setManageTeam(null)} title="Manage Team" size="lg">
        {manageTeam && (
          <div className="space-y-4">
            <div className="flex border-b border-zinc-750">
              {(
                [
                  { id: 'members' as const, label: 'Members', icon: Users2 },
                  { id: 'mentor' as const, label: 'Mentor', icon: ArrowLeftRight },
                  { id: 'group' as const, label: 'Group', icon: FolderTree },
                  { id: 'break' as const, label: 'Break Team', icon: Trash2, danger: true },
                ]
              ).map((tab) => {
                const Icon = tab.icon;
                const active = manageTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setManageTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                      active
                        ? tab.danger ? 'border-red-400 text-red-400' : 'border-gold text-gold'
                        : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                  >
                    <Icon size={13} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {manageTab === 'members' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  {manageTeam.members.map((m) => (
                    <div key={m.studentId} className="flex items-center justify-between bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2">
                      <span className="text-gray-300 text-sm">{m.fullName ?? m.studentId}</span>
                      <button
                        onClick={() => removeMember(m.studentId, m.fullName ?? 'This student')}
                        disabled={busy}
                        className="flex items-center gap-1 text-[11px] px-2 py-1 text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                      >
                        <UserMinus size={13} />
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div className="border-t border-zinc-800 pt-3 space-y-2">
                  <label className="text-xs text-gray-400 block">Add a student</label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={addStudentId}
                      onChange={setAddStudentId}
                      options={studentOptions}
                      placeholder="Select student"
                      isSearchable
                      className="flex-1"
                    />
                    <button
                      onClick={addMember}
                      disabled={busy || !addStudentId}
                      className="flex items-center gap-1.5 text-xs px-3 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
                    >
                      <UserPlus size={14} />
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {manageTab === 'mentor' && (
              <div className="space-y-3">
                <p className="text-gray-400 text-xs">
                  Current mentor: <span className="text-white">{rosterMentor?.mentorName ?? 'not assigned'}</span>
                </p>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">New mentor</label>
                  <Select value={newMentorId} onChange={setNewMentorId} options={mentorOptions} placeholder="Select mentor" isSearchable />
                </div>
                <button
                  onClick={reassignMentor}
                  disabled={busy || !newMentorId}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
                >
                  <ArrowLeftRight size={14} />
                  Reassign Mentor
                </button>
              </div>
            )}

            {manageTab === 'group' && (
              <div className="space-y-3">
                {!rosterMentor?.mentorId ? (
                  <p className="flex items-start gap-2 text-amber-400/90 text-xs">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    Groups belong to a mentor, so this team needs a mentor before it can be filed under one.
                  </p>
                ) : (
                  <>
                    <p className="text-gray-400 text-xs">
                      Groups organise one mentor's teams into named batches. Purely a label — sessions attach to the team itself, so
                      moving between groups never affects anything already scheduled.
                    </p>
                    <div className="space-y-1.5">
                      {groups.length === 0 ? (
                        <p className="text-gray-500 text-xs">This mentor has no groups yet.</p>
                      ) : (
                        groups.map((g) => (
                          <div key={g.id} className="flex items-center justify-between bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2">
                            <span className="text-gray-300 text-sm">{g.name}</span>
                            <button
                              onClick={() => moveToGroup(g.id)}
                              disabled={busy}
                              className="text-[11px] px-2.5 py-1 bg-zinc-750 text-gold rounded hover:bg-zinc-700 transition-colors disabled:opacity-50"
                            >
                              Move here
                            </button>
                          </div>
                        ))
                      )}
                      <button
                        onClick={() => moveToGroup(null)}
                        disabled={busy}
                        className="text-[11px] text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                      >
                        Remove from any group
                      </button>
                    </div>

                    <div className="border-t border-zinc-800 pt-3 flex items-center gap-2">
                      <input
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="New group name"
                        className="flex-1 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                      />
                      <button
                        onClick={createGroup}
                        disabled={busy || !newGroupName.trim()}
                        className="flex items-center gap-1.5 text-xs px-3 py-2 bg-zinc-750 text-gold font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
                      >
                        <Plus size={14} />
                        Create
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {manageTab === 'break' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 p-4">
                  <p className="text-xs text-red-300 leading-relaxed mb-3">
                    Breaking this team drops <span className="font-semibold text-red-200">
                      {manageTeam.members.map((m) => m.fullName ?? m.studentId).join(', ')}
                    </span> back to the teammate-invite step. This cannot be undone from here.
                  </p>
                  <button
                    onClick={breakTeam}
                    disabled={breakingTeamId === manageTeam.teamId}
                    className="w-full flex items-center justify-center gap-1.5 text-xs px-4 py-2 border border-red-400 text-red-400 font-semibold rounded-lg hover:bg-red-400/10 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {breakingTeamId === manageTeam.teamId ? 'Breaking…' : 'Break This Team'}
                  </button>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Reason (optional — recorded in the audit trail)</label>
                  <input
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                  />
                </div>
              </div>
            )}

            {(manageTab === 'members' || manageTab === 'mentor') && (
              <div className="border-t border-zinc-800 pt-3">
                <label className="text-xs text-gray-400 mb-1 block">Reason (optional — recorded in the audit trail)</label>
                <input
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
