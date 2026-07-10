import { useState, useEffect, useCallback } from 'react';
import { Percent, Save } from 'lucide-react';
import Select from '../../components/Select';
import SpinnerSquare from '../../components/SpinnerSquare';
import type { Cohort, MentorCapacitySummary } from '../../lib/types';
import { apiListMyCohorts, apiGetMentorCapacity, apiSetMentorTrackRatios } from '../../lib/api';
import { useAuth } from '../../context/useAuth';
import { getCohortLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';

export default function MentorCapacity() {
  const { user } = useAuth();
  const mentorId = user?.id;
  const { showError, showSuccess } = useToast();

  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [summary, setSummary] = useState<MentorCapacitySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

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
      setRatios(Object.fromEntries(res.ratios.map((r) => [r.track, r.ratioPercent])));
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

  const total = Object.values(ratios).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  const canSave = summary !== null && total === 100 && !saving;

  const handleSave = async () => {
    if (!mentorId || !summary) return;
    setSaving(true);
    try {
      await apiSetMentorTrackRatios(
        mentorId,
        summary.ratios.map((r) => ({ track: r.track, ratioPercent: ratios[r.track] ?? 0 }))
      );
      showSuccess('Capacity split saved.');
      await loadSummary(cohortId);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save your capacity split');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Percent size={24} className="text-gold" />
          My Capacity
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Split how many projects you can take on across the tracks you cover.
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
        <div className="space-y-4">
          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-1">
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Total capacity</p>
            <p className="text-white text-2xl font-bold">{summary.effectiveTotal}</p>
            <p className="text-gray-500 text-xs">
              {summary.override !== null
                ? `Set by admin (computed default was ${summary.computedBaseline})`
                : "Computed automatically from this cohort's project-to-mentor ratio"}
            </p>
          </div>

          <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold">Split across your tracks</p>
              <span className={`text-sm font-bold ${total === 100 ? 'text-green-400' : 'text-red-400'}`}>
                {total}% / 100%
              </span>
            </div>

            <div className="space-y-3">
              {summary.ratios.map((r) => (
                <div key={r.track} className="flex items-center gap-3">
                  <span className="flex-1 text-gray-300 text-sm">{r.track}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={ratios[r.track] ?? 0}
                    onChange={(e) =>
                      setRatios((prev) => ({ ...prev, [r.track]: Number(e.target.value) }))
                    }
                    className="w-20 bg-zinc-900 border border-zinc-750 rounded-lg px-2 py-1.5 text-white text-sm text-right focus:outline-none focus:border-gold"
                  />
                  <span className="text-gray-500 text-sm w-4">%</span>
                  <span className="text-gray-500 text-xs w-32 text-right">currently ~{r.threshold} projects</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
            >
              <Save size={14} />
              {saving ? 'Saving...' : 'Save Split'}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-12 text-center">
          <p className="text-gray-400">Select a cohort to view your capacity.</p>
        </div>
      )}
    </div>
  );
}
