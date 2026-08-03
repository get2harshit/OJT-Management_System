import { useState, useEffect, useCallback } from 'react';
import { Percent, Briefcase } from 'lucide-react';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { Cohort, MentorCapacitySummary, Team } from '../../lib/types';
import { apiListMyCohorts, apiGetMentorCapacity, apiListMyTeams } from '../../lib/api';
import { useAuth } from '../../context/useAuth';
import { getCohortLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';

export default function MentorCapacity() {
  const { user } = useAuth();
  const mentorId = user?.id;
  const { showError } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [summary, setSummary] = useState<MentorCapacitySummary | null>(null);
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);

  const loadCohorts = useCallback(() => {
    return apiListMyCohorts()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCohorts(list);
        setCohortId((prev) => prev || (list.length > 0 ? list[0].id : ''));
      })
      .catch(() => setCohorts([]));
  }, []);

  useEffect(() => {
    loadCohorts();
  }, [loadCohorts]);

  const loadSummary = useCallback(async (cid: string) => {
    if (!mentorId || !cid) return;
    setLoading(true);
    try {
      const [res, teams] = await Promise.all([
        apiGetMentorCapacity(mentorId, cid),
        apiListMyTeams().catch(() => []),
      ]);
      setSummary(res);
      setMyTeams(teams.filter(t => t.cohortId === cid));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load your capacity for this cohort');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [mentorId, showError]);

  useEffect(() => {
    if (cohortId) loadSummary(cohortId);
  }, [cohortId, loadSummary]);

  usePageRefresh(useCallback(
    () => Promise.all([loadCohorts(), cohortId ? loadSummary(cohortId) : Promise.resolve()]),
    [loadCohorts, loadSummary, cohortId]
  ));

  const assignedCount = myTeams.length;
  const totalCapacity = summary?.effectiveTotal ?? 0;
  const utilizationPct = totalCapacity > 0 ? Math.min(100, Math.round((assignedCount / totalCapacity) * 100)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Percent size={24} className="text-gold" />
          My Capacity & Utilization
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          How many projects you can take on in this cohort, across every track you cover.
        </p>
      </div>

      <div className="max-w-xs">
        <Select
          value={cohortId}
          onChange={setCohortId}
          options={cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) }))}
          placeholder="Select a cohort"
        />
      </div>

      {loading ? (
        <div className="min-h-[30vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Capacity Utilization</p>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-gold border border-gold/30">
                {assignedCount}/{totalCapacity} Projects Assigned
              </span>
            </div>
            <div>
              <p className="text-white text-3xl font-bold">{utilizationPct}%</p>
              <p className="text-gray-400 text-xs mt-1">
                {assignedCount} assigned out of {totalCapacity} total max allocation
              </p>
            </div>
            <div className="h-2.5 bg-zinc-750 rounded-full overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all duration-500"
                style={{ width: `${utilizationPct}%` }}
              />
            </div>
          </div>

          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-2 shadow-sm">
            <div className="flex items-center gap-2 text-gold">
              <Briefcase size={20} />
              <p className="text-xs uppercase font-bold tracking-wider text-gray-400">Total Capacity Details</p>
            </div>
            <p className="text-white text-3xl font-bold">{summary.effectiveTotal}</p>
            <p className="text-gray-400 text-xs leading-relaxed">
              {summary.override !== null
                ? `Manually set by admin (computed baseline default was ${summary.computedBaseline})`
                : "Computed automatically from this cohort's project-to-mentor ratio"}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center max-w-md">
          <p className="text-gray-400">Select a cohort to view your capacity.</p>
        </div>
      )}
    </div>
  );
}
