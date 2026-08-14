import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Users2, UserPlus, UserMinus, ArrowLeftRight, FolderTree, Plus, AlertTriangle } from 'lucide-react';
import PageLayout from '../../../components/PageLayout';
import CohortPageHeader from './CohortPageHeader';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import type { TeamAllocationDetail, ApiMentor, ApiStudent } from '../../../lib/types';
import {
  apiGetTeamsForCohortDetailed,
  apiGetCohort,
  apiListMentorsPage,
  apiListStudentsPage,
  apiAddTeamMember,
  apiRemoveTeamMember,
  apiReassignTeamMentor,
  apiMoveTeamToGroup,
  apiListMentorGroups,
  apiCreateMentorGroup,
  apiGetTeamRosterMentor,
  FutureSessionsConflictError,
  type ApiMentorGroup,
  type ApiTeamRosterMentor,
} from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';
import { usePageRefresh } from '../../../context/RefreshContext';

type ManageTab = 'members' | 'mentor' | 'group';

/**
 * Admin roster management for a cohort's teams: who is on a team, which
 * mentor owns it, and which of that mentor's groups it's filed under.
 *
 * The three operations differ in how dangerous they are, and the UI keeps
 * that distinction visible rather than flattening it:
 *   - moving a team between groups is purely organisational and just happens;
 *   - removing a student, or changing a team's mentor, can disturb sessions
 *     already on the calendar. The backend refuses those with a 409 listing
 *     how many upcoming sessions are affected, and this page turns that
 *     refusal into an explicit confirmation rather than retrying silently.
 * Sessions already completed are never touched by any of it.
 */
export default function CohortRosterPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const [cohortLabel, setCohortLabel] = useState('');
  const [teams, setTeams] = useState<TeamAllocationDetail[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [students, setStudents] = useState<ApiStudent[]>([]);

  const [manageTeam, setManageTeam] = useState<TeamAllocationDetail | null>(null);
  const [manageTab, setManageTab] = useState<ManageTab>('members');
  const [busy, setBusy] = useState(false);

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
    apiGetCohort(cohortId)
      .then((c) => setCohortLabel(getCohortLabel(c)))
      .catch(() => setCohortLabel(''));
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

  /**
   * Runs a roster action, and if the backend refuses because upcoming
   * sessions would be affected, asks the admin whether to go ahead — then
   * retries with the cascade flag. The count comes from the backend's own
   * refusal, so the question names a real number instead of a vague warning.
   */
  const withCascadeConfirm = async (
    run: (cascade: boolean) => Promise<void>,
    prompt: (count: number) => { title: string; message: string; confirmLabel: string }
  ) => {
    setBusy(true);
    try {
      await run(false);
    } catch (err) {
      if (err instanceof FutureSessionsConflictError) {
        const { title, message, confirmLabel } = prompt(err.futureSessionCount);
        const proceed = await confirm({ title, message, confirmLabel, variant: 'danger' });
        if (!proceed) {
          setBusy(false);
          return;
        }
        try {
          await run(true);
        } catch (retryErr) {
          showError(retryErr instanceof Error ? retryErr.message : 'Action failed');
          setBusy(false);
          return;
        }
      } else {
        showError(err instanceof Error ? err.message : 'Action failed');
        setBusy(false);
        return;
      }
    }
    setBusy(false);
  };

  const addMember = async () => {
    if (!manageTeam || !addStudentId) return;
    setBusy(true);
    try {
      await apiAddTeamMember(manageTeam.teamId, addStudentId);
      showSuccess('Student added to the team');
      await refreshAfterChange();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add student');
    } finally {
      setBusy(false);
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
    setBusy(true);
    try {
      await apiMoveTeamToGroup(manageTeam.teamId, groupId, changeReason.trim() || undefined);
      showSuccess(groupId ? 'Team moved to the group' : 'Team ungrouped');
      await refreshAfterChange();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to move team');
    } finally {
      setBusy(false);
    }
  };

  const createGroup = async () => {
    if (!cohortId || !rosterMentor?.mentorId || !newGroupName.trim()) return;
    setBusy(true);
    try {
      const group = await apiCreateMentorGroup(cohortId, rosterMentor.mentorId, newGroupName.trim());
      setGroups((prev) => [...prev, group]);
      setNewGroupName('');
      showSuccess(`Group "${group.name}" created`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setBusy(false);
    }
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
      <CohortPageHeader title="Roster & Mentors" subtitle={cohortLabel} />

      <DataTable
        columns={[
          {
            key: 'memberNames',
            header: 'Members',
            render: (row) => (
              <span className="flex items-center gap-2">
                <Users2 size={14} className="text-gold shrink-0" />
                {row.memberNames || '—'}
              </span>
            ),
          },
          { key: 'mentorName', header: 'Mentor', render: (row) => row.allocatedMentorName ?? <span className="text-gray-500">Not allocated</span> },
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
                ]
              ).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setManageTab(tab.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-b-2 transition-all ${
                      manageTab === tab.id ? 'border-gold text-gold' : 'border-transparent text-gray-400 hover:text-white'
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

            {manageTab !== 'group' && (
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
