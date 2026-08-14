import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users2, Trash2, Settings2 } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import SpinnerSquare from '../../../components/SpinnerSquare';
import type { AdminTeam } from '../../../lib/types';
import { apiListTeamsForCohort, apiBreakTeam } from '../../../lib/api';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';
import { usePageRefresh } from '../../../context/RefreshContext';

// Admin view of every team formed within a cohort, with a Break action that
// disbands a team so its members drop back to the teammate-invite step —
// used to reset test accounts without a manual DB query.
export default function CohortTeamsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [breakingTeamId, setBreakingTeamId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      const teamList = await apiListTeamsForCohort(cohortId);
      setTeams(teamList);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  usePageRefresh(fetchData);

  const handleBreakTeam = async (team: AdminTeam) => {
    const memberNames = team.members.map(m => m.fullName || m.studentId).join(', ');
    const confirmBreak = await confirm({
      title: 'Break team',
      message: `Break this team (${memberNames})? Members will drop back to the teammate-invite step.`,
      confirmLabel: 'Break Team',
      variant: 'danger',
    });
    if (!confirmBreak) return;

    setBreakingTeamId(team.id);
    try {
      await apiBreakTeam(team.id);
      showSuccess('Team disbanded successfully!');
      await fetchData();
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to break team');
    } finally {
      setBreakingTeamId(null);
    }
  };

  const data = teams.map(t => ({
    id: t.id,
    members: t.members.map(m => m.fullName || m.studentId).join(', '),
    track: t.track,
    type: t.isIndividual ? 'Individual' : 'Paired',
    projectStatus: t.hasSubmittedProjectPreferences ? 'Submitted' : 'Pending',
  }));

  return (
    <PageLayout className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => navigate(`/admin/dashboard/ojts/${cohortId}/roster`)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-zinc-750 text-gold font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
        >
          <Settings2 size={13} />
          Roster &amp; Mentors
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
              header: 'Members',
              render: (row) => (
                <span className="flex items-center gap-2">
                  <Users2 size={14} className="text-gold shrink-0" />
                  {row.members}
                </span>
              ),
            },
            { key: 'track', header: 'Track' },
            { key: 'type', header: 'Type' },
            {
              key: 'projectStatus',
              header: 'Project Preferences',
              render: (row) => (
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                  row.projectStatus === 'Submitted' ? 'bg-green-400/10 text-green-400' : 'bg-gray-400/10 text-gray-400'
                }`}>
                  {row.projectStatus}
                </span>
              ),
            },
          ]}
          data={data}
          searchPlaceholder="Search teams..."
          actions={(row) => {
            const team = teams.find(t => t.id === row.id);
            if (!team) return null;
            return (
              <button
                onClick={() => handleBreakTeam(team)}
                disabled={breakingTeamId === team.id}
                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-md transition-colors disabled:opacity-50"
                title="Break team"
              >
                <Trash2 size={15} />
              </button>
            );
          }}
        />
      )}
    </PageLayout>
  );
}
