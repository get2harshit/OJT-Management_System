import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { BarChart3, Users } from 'lucide-react';
import SpinnerSquare from '../../../components/SpinnerSquare';
import CohortPageHeader from './CohortPageHeader';
import { apiGetCohort, apiGetProjectInsights } from '../../../lib/api';
import type { ProjectInsights, CountBucket, CrossTabCell } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

// What the project catalog looks like, for the admin who has to fix it.
//
// No charting library: the app carries none, the bundle already warns about
// its size, and everything here is either a labelled bar or a grid of numbers.
// A bar is a div with a percentage width, and a heatmap is a table with a
// background — both read better with their own labels than a chart would.

/** A labelled horizontal bar, sized against the largest value in its group. */
function BarRow({ label, count, max, tone = 'bg-gold' }: { label: string; count: number; max: number; tone?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-xs text-gray-400 truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full ${tone} rounded-full transition-all duration-500`}
          style={{ width: max > 0 ? `${Math.max((count / max) * 100, 2)}%` : '0%' }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs text-white font-semibold tabular-nums">{count}</span>
    </div>
  );
}

function BarPanel({ title, buckets, tone }: { title: string; buckets: CountBucket[]; tone?: string }) {
  const max = Math.max(0, ...buckets.map(b => b.count));
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
      <p className="text-xs uppercase font-bold tracking-wider text-gray-400 mb-4">{title}</p>
      {buckets.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing recorded.</p>
      ) : (
        <div className="space-y-2.5">
          {buckets.map(b => (
            <BarRow key={b.label} label={b.label} count={b.count} max={max} tone={tone} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A cross-tab as a shaded grid.
 *
 * The empty cells are the reason this exists — a track catalogued once for
 * 2024 and never refreshed reads as a row of zeros, which neither the
 * track list nor the year list shows on its own. So zero is drawn as a
 * visible dash rather than left blank, and shading is by share of the
 * busiest cell.
 */
function CrossTab({ title, cells, note }: { title: string; cells: CrossTabCell[]; note: string }) {
  const rows = [...new Set(cells.map(c => c.row))].sort();
  const columns = [...new Set(cells.map(c => c.column))].sort();
  const max = Math.max(0, ...cells.map(c => c.count));
  const at = (row: string, column: string) => cells.find(c => c.row === row && c.column === column)?.count ?? 0;

  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
      <p className="text-xs uppercase font-bold tracking-wider text-gray-400">{title}</p>
      <p className="text-xs text-gray-500 mt-1 mb-4">{note}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-1">
            <thead>
              <tr>
                <th />
                {columns.map(column => (
                  <th key={column} className="text-xs font-semibold text-gray-400 px-2 pb-1 capitalize">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row}>
                  <td className="text-xs text-gray-400 pr-3 whitespace-nowrap">{row}</td>
                  {columns.map(column => {
                    const count = at(row, column);
                    return (
                      <td
                        key={column}
                        className={`text-center text-xs font-semibold tabular-nums rounded-md px-3 py-2 ${
                          count === 0 ? 'text-gray-600 bg-zinc-800/40' : 'text-white'
                        }`}
                        style={
                          count > 0
                            ? { backgroundColor: `rgba(234, 179, 8, ${0.12 + (count / max) * 0.5})` }
                            : undefined
                        }
                      >
                        {count === 0 ? '—' : count}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ProjectInsightsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [insights, setInsights] = useState<ProjectInsights | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!cohortId) return;
    try {
      const [cohort, data] = await Promise.all([
        apiGetCohort(cohortId).catch(() => null),
        apiGetProjectInsights(cohortId),
      ]);
      if (cohort) setCohortLabel(getCohortLabel(cohort));
      setInsights(data);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load catalog analytics');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  usePageRefresh(fetchData);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-12 text-center">
        <p className="text-gray-400">Couldn’t read the catalog for this OJT.</p>
      </div>
    );
  }

  const { totals } = insights;

  return (
    <div className="space-y-5">
      <CohortPageHeader
        title="Catalog analytics"
        subtitle={cohortLabel || undefined}
        icon={BarChart3}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Projects', value: totals.projects },
          { label: 'Tracks', value: totals.tracks },
          { label: 'Admission years', value: totals.batches },
          { label: 'Avg duration', value: totals.avgDurationWeeks === null ? '—' : `${totals.avgDurationWeeks} wks` },
        ].map(card => (
          <div key={card.label} className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
            <p className="text-xs uppercase font-bold tracking-wider text-gray-400">{card.label}</p>
            <p className="text-3xl font-bold text-white mt-1 tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <BarPanel title="Projects per track" buckets={insights.byTrack} />
        <BarPanel title="Projects per admission year" buckets={insights.byBatch} tone="bg-blue-400" />
        <BarPanel title="Projects per level" buckets={insights.byLevel} tone="bg-emerald-500" />
        <BarPanel
          title="Estimated duration (weeks)"
          buckets={insights.byDuration.map(b => ({ ...b, label: `${b.label} weeks` }))}
          tone="bg-purple-400"
        />
      </div>

      <CrossTab
        title="Track × admission year"
        cells={insights.trackByBatch}
        note="A row of dashes is a track catalogued for one intake and never refreshed — students of the other years can't pick it."
      />

      <CrossTab
        title="Track × level"
        cells={insights.trackByLevel}
        note="Empty cells are coverage gaps: a team pointed at that difficulty on that track has nothing to choose from."
      />

      <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-gold shrink-0" />
          <p className="text-xs uppercase font-bold tracking-wider text-gray-400">Mentor coverage</p>
        </div>
        {/* Named carefully: this is how often the catalog *recommends* a
            mentor, not how many teams they have. A mentor on forty projects
            may end up supervising none, and reading this as workload would
            have somebody setting capacity from an unrelated number. */}
        <p className="text-xs text-gray-500 mt-1 mb-4">
          How many catalog projects name each mentor. This is not their team load — a project can
          recommend a mentor no team ends up picking.
        </p>
        {insights.mentorCoverage.length === 0 ? (
          <p className="text-sm text-gray-500">No project in this catalog names a mentor.</p>
        ) : (
          <div className="space-y-2.5 max-h-96 overflow-y-auto -mr-2 pr-2">
            {insights.mentorCoverage.map(mentor => (
              <BarRow
                key={mentor.mentorId}
                label={mentor.fullName ?? 'Unnamed mentor'}
                count={mentor.projectCount}
                max={insights.mentorCoverage[0].projectCount}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
