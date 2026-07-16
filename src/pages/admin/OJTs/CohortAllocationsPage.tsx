import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { User, Users2, Shuffle, CheckCircle2, ArrowLeftRight, UserCog, Gauge, RotateCcw } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import SpinnerSquare from '../../../components/SpinnerSquare';
import type { TeamAllocationDetail, ApiMentor, MentorLoadSummaryRow } from '../../../lib/types';
import {
  apiGetTeamsForCohortDetailed,
  apiRunAllocation,
  apiOverrideTeamAllocation,
  apiOverrideTeamMentor,
  apiGetMentorLoadSummary,
  apiReverseAllocation,
  apiGetCohort,
} from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { formatDateDisplay } from '../../../lib/utils';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';

const STATUS_STYLES: Record<string, string> = {
  allocated: 'bg-green-400/10 text-green-400',
  needs_review: 'bg-red-400/10 text-red-400',
  pending: 'bg-gray-400/10 text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  allocated: 'Allocated',
  needs_review: 'Needs Review',
  pending: 'Pending',
};

export default function CohortAllocationsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const [cohortLabel, setCohortLabel] = useState('');
  const [teams, setTeams] = useState<TeamAllocationDetail[]>([]);
  const [cohortMentors, setCohortMentors] = useState<ApiMentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [overrideTeam, setOverrideTeam] = useState<TeamAllocationDetail | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  const [mentorOverrideTeam, setMentorOverrideTeam] = useState<TeamAllocationDetail | null>(null);
  const [mentorSearch, setMentorSearch] = useState('');
  const [savingMentorOverride, setSavingMentorOverride] = useState(false);
  const [mentorLoadSummary, setMentorLoadSummary] = useState<MentorLoadSummaryRow[]>([]);
  const [showLoadSummary, setShowLoadSummary] = useState(false);
  const [detailTeam, setDetailTeam] = useState<TeamAllocationDetail | null>(null);

  const fetchData = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const [detail, cohort, loadSummary] = await Promise.all([
        apiGetTeamsForCohortDetailed(cohortId),
        apiGetCohort(cohortId),
        apiGetMentorLoadSummary(cohortId),
      ]);
      setTeams(detail);
      setCohortLabel(getCohortLabel(cohort));
      setCohortMentors(cohort.mentors ?? []);
      setMentorLoadSummary(loadSummary);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load teams for allocation');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleReverseAllocation = async () => {
    if (!cohortId) return;
    const confirmReverse = await confirm({
      title: 'Reverse allocation',
      message:
        "Reset every algorithm-allocated team in this cohort back to pending? Submitted preferences are kept — a fresh Run Allocation will re-resolve them. Teams an admin manually overrode are left untouched.",
      confirmLabel: 'Reverse Allocation',
      variant: 'danger',
    });
    if (!confirmReverse) return;

    setReversing(true);
    try {
      const { reversedCount } = await apiReverseAllocation(cohortId);
      showSuccess(`${reversedCount} team${reversedCount === 1 ? '' : 's'} reset back to pending.`);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to reverse allocation');
    } finally {
      setReversing(false);
    }
  };

  const handleRunAllocation = async () => {
    if (!cohortId) return;
    setRunning(true);
    try {
      await apiRunAllocation(cohortId);
      showSuccess('Allocation run complete.');
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to run allocation');
    } finally {
      setRunning(false);
    }
  };

  const handleOverride = async (projectId: string) => {
    if (!overrideTeam) return;
    setSavingOverride(true);
    try {
      await apiOverrideTeamAllocation(overrideTeam.teamId, projectId);
      showSuccess('Allocation updated.');
      setOverrideTeam(null);
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update allocation');
    } finally {
      setSavingOverride(false);
    }
  };

  const handleOverrideMentor = async (mentorId: string) => {
    if (!mentorOverrideTeam) return;
    setSavingMentorOverride(true);
    try {
      await apiOverrideTeamMentor(mentorOverrideTeam.teamId, mentorId);
      showSuccess('Mentor updated.');
      setMentorOverrideTeam(null);
      setMentorSearch('');
      await fetchData();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update mentor');
    } finally {
      setSavingMentorOverride(false);
    }
  };

  const data = teams.map((t) => ({
    id: t.teamId,
    members: t.members.map((m) => m.fullName || m.studentId).join(', '),
    memberCount: t.members.length,
    submittedAt: formatDateDisplay(t.submittedAt),
    pref1: `${t.preference1.projectTitle}${t.preference1.mentorName ? ` · ${t.preference1.mentorName}` : ''}`,
    pref2: `${t.preference2.projectTitle}${t.preference2.mentorName ? ` · ${t.preference2.mentorName}` : ''}`,
    pref1ProjectId: t.preference1.projectId,
    pref2ProjectId: t.preference2.projectId,
    allocatedProjectId: t.allocatedProjectId,
    status: t.allocationStatus,
    overriddenAt: t.overriddenAt,
    allocated: (() => {
      const projectTitle =
        t.allocatedProjectId === t.preference1.projectId
          ? t.preference1.projectTitle
          : t.allocatedProjectId === t.preference2.projectId
          ? t.preference2.projectTitle
          : null;
      if (!projectTitle) return '—';
      return t.allocatedMentorName ? `${projectTitle} · ${t.allocatedMentorName}` : projectTitle;
    })(),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <CohortPageHeader title="Project Allocation" subtitle={cohortLabel} />
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowLoadSummary(true)}
            disabled={loading}
            title="Mentor load summary"
            className="flex items-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <Gauge size={14} />
          </button>
          <button
            onClick={handleReverseAllocation}
            disabled={reversing || running || loading}
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} />
            {reversing ? 'Reversing...' : 'Reverse Allocation'}
          </button>
          <button
            onClick={handleRunAllocation}
            disabled={running || reversing || loading}
            className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            <Shuffle size={14} />
            {running ? 'Running...' : 'Run Allocation'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <DataTable
          columns={[
            {
              key: 'members',
              header: 'Team',
              render: (row) => (
                <span className="flex items-center gap-2">
                  {row.memberCount > 1 ? (
                    <Users2 size={14} className="text-gold shrink-0" />
                  ) : (
                    <User size={14} className="text-gold shrink-0" />
                  )}
                  {row.members}
                </span>
              ),
            },
            { key: 'submittedAt', header: 'Submitted' },
            {
              key: 'pref1',
              header: 'Preference 1',
              render: (row) => (
                <span className={row.allocatedProjectId && row.pref1ProjectId === row.allocatedProjectId ? 'text-green-400 font-medium' : undefined}>
                  {row.pref1}
                </span>
              ),
            },
            {
              key: 'pref2',
              header: 'Preference 2',
              render: (row) => (
                <span className={row.allocatedProjectId && row.pref2ProjectId === row.allocatedProjectId ? 'text-green-400 font-medium' : undefined}>
                  {row.pref2}
                </span>
              ),
            },
            {
              key: 'allocated',
              header: 'Allocated',
              render: (row) => (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[row.status] ?? STATUS_STYLES.pending}`}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                    {row.overriddenAt && (
                      <span
                        title="Manually overridden by an admin — skipped by bulk reverse"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-400/10 text-blue-400"
                      >
                        Overridden
                      </span>
                    )}
                  </span>
                  {row.allocated !== '—' && <p className="text-gray-400 text-xs">{row.allocated}</p>}
                </div>
              ),
            },
          ]}
          data={data}
          searchPlaceholder="Search teams..."
          onRowClick={(row) => setDetailTeam(teams.find((t) => t.teamId === row.id) ?? null)}
        />
      )}

      <Modal open={!!detailTeam} onClose={() => setDetailTeam(null)} title="Team Detail">
        {detailTeam && (
          <div className="space-y-4">
            <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3 space-y-1">
              <p className="text-white text-sm font-semibold flex items-center gap-2">
                {detailTeam.members.length > 1 ? (
                  <Users2 size={14} className="text-gold shrink-0" />
                ) : (
                  <User size={14} className="text-gold shrink-0" />
                )}
                {detailTeam.teamName || 'Unnamed Team'}
              </p>
              <p className="text-gray-300 text-xs">
                {detailTeam.members.map((m) => m.fullName || m.studentId).join(', ')}
              </p>
              <p className="text-gray-400 text-xs">
                {detailTeam.track} · Tier {detailTeam.tier} · Submitted {formatDateDisplay(detailTeam.submittedAt)}
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[detailTeam.allocationStatus] ?? STATUS_STYLES.pending}`}>
                {STATUS_LABELS[detailTeam.allocationStatus] ?? detailTeam.allocationStatus}
              </span>
              {detailTeam.overriddenAt && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-400/10 text-blue-400">
                  Overridden
                </span>
              )}
            </div>

            {[detailTeam.preference1, detailTeam.preference2].map((pref, idx) => {
              const selected = detailTeam.allocatedProjectId === pref.projectId && !detailTeam.overriddenAt;
              return (
                <div
                  key={pref.projectId}
                  className={`rounded-lg p-3 border ${selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750'}`}
                >
                  <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Preference {idx + 1}</p>
                  <p className="text-white font-semibold text-sm">{pref.projectTitle}</p>
                  {pref.mentorName && <p className="text-gray-400 text-xs mt-0.5">{pref.mentorName}</p>}
                </div>
              );
            })}

            {detailTeam.allocatedProjectId && (
              <div className="rounded-lg p-3 border border-green-400/30 bg-green-400/5">
                <p className="text-xs text-green-400 uppercase font-bold tracking-wider mb-1">Allocated</p>
                <p className="text-white font-semibold text-sm">
                  {detailTeam.allocatedProjectId === detailTeam.preference1.projectId
                    ? detailTeam.preference1.projectTitle
                    : detailTeam.preference2.projectTitle}
                </p>
                {detailTeam.allocatedMentorName && <p className="text-gray-400 text-xs mt-0.5">{detailTeam.allocatedMentorName}</p>}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => { setOverrideTeam(detailTeam); setDetailTeam(null); }}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
              >
                <ArrowLeftRight size={14} />
                Override Project
              </button>
              <button
                onClick={() => { setMentorOverrideTeam(detailTeam); setDetailTeam(null); }}
                disabled={!detailTeam.allocatedProjectId}
                title={!detailTeam.allocatedProjectId ? 'Team must be allocated a project first' : undefined}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <UserCog size={14} />
                Assign Other Mentor
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!overrideTeam} onClose={() => setOverrideTeam(null)} title="Override Allocation">
        {overrideTeam && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              Choose which of this team's own preferences to allocate. This overrides any recommendation.
            </p>
            {[overrideTeam.preference1, overrideTeam.preference2].map((pref, idx) => {
              const selected = overrideTeam.allocatedProjectId === pref.projectId;
              return (
                <button
                  key={pref.projectId}
                  onClick={() => handleOverride(pref.projectId)}
                  disabled={savingOverride}
                  className={`w-full text-left rounded-lg p-4 border transition-all duration-200 disabled:opacity-50 ${
                    selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">
                        Preference {idx + 1}
                      </p>
                      <p className="text-white font-semibold">{pref.projectTitle}</p>
                      {pref.mentorName && <p className="text-gray-400 text-xs mt-0.5">{pref.mentorName}</p>}
                    </div>
                    {selected && <CheckCircle2 size={18} className="text-gold shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={!!mentorOverrideTeam}
        onClose={() => { setMentorOverrideTeam(null); setMentorSearch(''); }}
        title="Change Mentor"
      >
        {mentorOverrideTeam && (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">
              Assign any mentor in this cohort to this team — not limited to their track or submitted preferences.
              The allocated project stays unchanged.
            </p>
            <input
              type="text"
              value={mentorSearch}
              onChange={(e) => setMentorSearch(e.target.value)}
              placeholder="Search mentors..."
              className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
            />
            <div className="max-h-72 overflow-y-auto space-y-2">
              {cohortMentors
                .filter((m) => (m.fullName || '').toLowerCase().includes(mentorSearch.toLowerCase()))
                .map((mentor) => {
                  const selected = mentorOverrideTeam.allocatedMentorId === mentor.id;
                  const load = mentorLoadSummary.find((m) => m.mentorId === mentor.id);
                  const overCapacity = !!load && load.allocatedCount >= load.threshold;
                  return (
                    <button
                      key={mentor.id}
                      onClick={() => handleOverrideMentor(mentor.id)}
                      disabled={savingMentorOverride}
                      className={`w-full text-left rounded-lg p-3 border transition-all duration-200 disabled:opacity-50 ${
                        selected ? 'bg-gold/10 border-gold' : 'bg-zinc-900 border-zinc-750 hover:border-zinc-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-white font-semibold text-sm">{mentor.fullName || '—'}</p>
                          <p className="text-gray-500 text-xs">{(mentor.tracks ?? []).join(', ') || 'No tracks assigned'}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {load && (
                            <span className={`text-xs font-bold ${overCapacity ? 'text-red-400' : 'text-gray-400'}`}>
                              {load.allocatedCount}/{load.threshold}
                            </span>
                          )}
                          {selected && <CheckCircle2 size={16} className="text-gold shrink-0" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={showLoadSummary} onClose={() => setShowLoadSummary(false)} title="Mentor Load Summary">
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {mentorLoadSummary.length === 0 ? (
            <p className="text-gray-400 text-sm">No mentor capacity configured for this cohort yet.</p>
          ) : (
            [...mentorLoadSummary]
              .sort((a, b) => (a.mentorName || '').localeCompare(b.mentorName || ''))
              .map((row) => {
                const overCapacity = row.allocatedCount > row.threshold;
                const mentorTracks = cohortMentors.find((m) => m.id === row.mentorId)?.tracks ?? [];
                return (
                  <div
                    key={row.mentorId}
                    className="flex items-center justify-between gap-3 bg-zinc-800/50 border border-zinc-750 rounded-lg px-3 py-2"
                  >
                    <div>
                      <p className="text-white text-sm font-medium">{row.mentorName || '—'}</p>
                      <p className="text-gray-500 text-xs">{mentorTracks.join(', ') || 'No tracks assigned'}</p>
                    </div>
                    <span className={`text-sm font-bold ${overCapacity ? 'text-red-400' : 'text-gray-300'}`}>
                      {row.allocatedCount}/{row.threshold}
                    </span>
                  </div>
                );
              })
          )}
        </div>
      </Modal>
    </div>
  );
}
