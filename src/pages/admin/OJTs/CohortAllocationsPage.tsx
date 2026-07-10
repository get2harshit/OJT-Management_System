import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Users2, Shuffle, CheckCircle2 } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import DataTable from '../../../components/DataTable';
import Modal from '../../../components/Modal';
import SpinnerSquare from '../../../components/SpinnerSquare';
import type { TeamAllocationDetail } from '../../../lib/types';
import { apiGetTeamsForCohortDetailed, apiRunAllocation, apiOverrideTeamAllocation, apiGetCohort } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { formatDateDisplay } from '../../../lib/utils';
import { useToast } from '../../../toast';

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

  const [cohortLabel, setCohortLabel] = useState('');
  const [teams, setTeams] = useState<TeamAllocationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [overrideTeam, setOverrideTeam] = useState<TeamAllocationDetail | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);

  const fetchData = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const [detail, cohort] = await Promise.all([
        apiGetTeamsForCohortDetailed(cohortId),
        apiGetCohort(cohortId),
      ]);
      setTeams(detail);
      setCohortLabel(getCohortLabel(cohort));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load teams for allocation');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const data = teams.map((t) => ({
    id: t.teamId,
    members: t.members.map((m) => m.fullName || m.studentId).join(', '),
    track: t.track,
    tier: t.tier,
    submittedAt: formatDateDisplay(t.submittedAt),
    pref1: `${t.preference1.projectTitle}${t.preference1.mentorName ? ` · ${t.preference1.mentorName}` : ''}`,
    pref2: `${t.preference2.projectTitle}${t.preference2.mentorName ? ` · ${t.preference2.mentorName}` : ''}`,
    status: t.allocationStatus,
    allocated:
      t.allocatedProjectId === t.preference1.projectId
        ? t.preference1.projectTitle
        : t.allocatedProjectId === t.preference2.projectId
        ? t.preference2.projectTitle
        : '—',
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <CohortPageHeader title="Project Allocation" subtitle={cohortLabel} />
        <button
          onClick={handleRunAllocation}
          disabled={running || loading}
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50 shrink-0"
        >
          <Shuffle size={14} />
          {running ? 'Running...' : 'Run Allocation'}
        </button>
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
                  <Users2 size={14} className="text-gold shrink-0" />
                  {row.members}
                </span>
              ),
            },
            { key: 'track', header: 'Track' },
            { key: 'tier', header: 'Tier' },
            { key: 'submittedAt', header: 'Submitted' },
            { key: 'pref1', header: 'Preference 1' },
            { key: 'pref2', header: 'Preference 2' },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[row.status] ?? STATUS_STYLES.pending}`}>
                  {STATUS_LABELS[row.status] ?? row.status}
                </span>
              ),
            },
            { key: 'allocated', header: 'Allocated Project' },
          ]}
          data={data}
          searchPlaceholder="Search teams..."
          actions={(row) => {
            const team = teams.find((t) => t.teamId === row.id);
            if (!team) return null;
            return (
              <button
                onClick={() => setOverrideTeam(team)}
                className="text-xs px-3 py-1.5 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
              >
                Override
              </button>
            );
          }}
        />
      )}

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
    </div>
  );
}
