import { useState, useEffect, useCallback } from 'react';
import { Percent } from 'lucide-react';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { Cohort, MentorCapacitySummary } from '../../lib/types';
import { apiListMyCohorts, apiGetMentorCapacity } from '../../lib/api';
import { useAuth } from '../../context/useAuth';
import { getCohortLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';

export default function MentorCapacity() {
  const { user } = useAuth();
  const mentorId = user?.id;
  const { showError } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [summary, setSummary] = useState<MentorCapacitySummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiListMyCohorts()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCohorts(list);
        if (list.length > 0) setCohortId(list[0].id);
      })
      .catch(() => setCohorts([]));
  }, []);

  const loadSummary = useCallback(async (cid: string) => {
    if (!mentorId || !cid) return;
    setLoading(true);
    try {
      const res = await apiGetMentorCapacity(mentorId, cid);
      setSummary(res);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Percent size={24} className="text-gold" />
          My Capacity
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
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-1 max-w-sm">
          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Total capacity</p>
          <p className="text-white text-2xl font-bold">{summary.effectiveTotal}</p>
          <p className="text-gray-500 text-xs">
            {summary.override !== null
              ? `Set by admin (computed default was ${summary.computedBaseline})`
              : "Computed automatically from this cohort's project-to-mentor ratio"}
          </p>
        </div>
      ) : (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center">
          <p className="text-gray-400">Select a cohort to view your capacity.</p>
        </div>
      )}
    </div>
  );
}
