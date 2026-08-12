import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Select from '../../../components/Select';
import { apiGetOpsAnalytics } from '../../../lib/api';
import type { OpsAnalytics, OpsTimelinePoint, OpsTrackAnalytics } from '../../../lib/api/ops';
import {
  SUBMISSION_MODE_LABELS,
  SUBMISSION_MODE_ORDER,
  SUBMISSION_MODE_SHORT_LABELS,
  type TrackSubmissionMode,
} from '../../../lib/api/tracks';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

/**
 * The Overview tab: what this OJT's teams have actually chosen.
 *
 * Every number here is a choice somebody made — teams formed, projects picked,
 * mentors selected. That is the whole distinction from Project Insights, which
 * counts the catalog as configured: there, "Gen AI 147" means the catalog holds
 * 147 Gen AI projects; here it means teams picked N of them. The two screens
 * deliberately share a visual language so the pair reads as catalog vs uptake.
 *
 * No charting library, same as Project Insights and for the same reason: the
 * bundle already warns about its size, and a labelled bar or a shaded grid
 * reads better than a chart component would.
 */

// ── Layout primitives, matching ProjectInsightsPage ──────────────────────────

function BarRow({
  label,
  count,
  max,
  tone = 'bg-gold',
  suffix,
}: {
  label: string;
  count: number;
  max: number;
  tone?: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-xs text-gray-400 truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden min-w-[30px]">
        <div
          className={`h-full ${tone} rounded-full transition-all duration-500`}
          style={{ width: max > 0 ? `${Math.max((count / max) * 100, 2)}%` : '0%' }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-xs text-white font-semibold tabular-nums">
        {count}
        {suffix && <span className="text-gray-500 font-normal">{suffix}</span>}
      </span>
    </div>
  );
}

function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  /** Rendered on the title row, right-aligned — a filter, a toggle. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase font-bold tracking-wider text-gray-400">{title}</p>
          {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function BarPanel({
  title,
  note,
  buckets,
  tone,
}: {
  title: string;
  note?: string;
  buckets: { label: string; count: number; suffix?: string }[];
  tone?: string;
}) {
  const max = Math.max(0, ...buckets.map((b) => b.count));
  return (
    <Panel title={title} note={note}>
      {buckets.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing recorded.</p>
      ) : (
        <div className="space-y-2.5">
          {buckets.map((b) => (
            <BarRow key={b.label} label={b.label} count={b.count} max={max} tone={tone} suffix={b.suffix} />
          ))}
        </div>
      )}
    </Panel>
  );
}

/**
 * A cross-tab as a shaded grid, same as the catalog screen's.
 *
 * Zero is drawn as a visible dash rather than left blank — a year that has
 * picked nothing on a track is a finding, and an empty cell reads as missing
 * data instead.
 */
function CrossTab({
  title,
  note,
  cells,
}: {
  title: string;
  note: string;
  cells: { row: string; column: string; count: number }[];
}) {
  const rows = [...new Set(cells.map((c) => c.row))].sort();
  const columns = [...new Set(cells.map((c) => c.column))].sort();
  const max = Math.max(0, ...cells.map((c) => c.count));
  const at = (row: string, column: string) => cells.find((c) => c.row === row && c.column === column)?.count ?? 0;

  return (
    <Panel title={title} note={note}>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-1">
            <thead>
              <tr>
                <th />
                {columns.map((column) => (
                  <th key={column} className="text-xs font-semibold text-gray-400 px-2 pb-1 whitespace-nowrap">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row}>
                  <td className="text-xs text-gray-400 pr-3 whitespace-nowrap">{row}</td>
                  {columns.map((column) => {
                    const count = at(row, column);
                    return (
                      <td
                        key={column}
                        className={`text-center text-xs font-semibold tabular-nums rounded-md px-3 py-2 ${
                          count === 0 ? 'text-gray-600 bg-zinc-800/40' : 'text-white'
                        }`}
                        style={count > 0 ? { backgroundColor: `rgba(234, 179, 8, ${0.12 + (count / max) * 0.5})` } : undefined}
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
    </Panel>
  );
}

/**
 * The three running totals as lines. Hand-drawn: it is one polyline per series
 * over a shared scale, and a library costs ~100KB gzipped for the one thing on
 * this page that genuinely needs a line. A one-day-old OJT renders as dots.
 */
function ProgressLine({ points }: { points: OpsTimelinePoint[] }) {
  if (points.length === 0) return <p className="text-sm text-gray-500">Nothing has happened yet.</p>;

  const width = 640;
  const height = 110;
  const max = Math.max(...points.map((p) => p.teamsFormed), 1);
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  // Blue / yellow / green, reusing the status convention the Allocation
  // Blueprint's stage dots already established — in progress, waiting, done.
  // Gold and yellow-500 were the first pair here and were near enough to each
  // other that the two lines read as one.
  const series = [
    { key: 'teamsFormed' as const, label: 'Teams formed', stroke: '#60a5fa' },
    { key: 'teamsSubmitted' as const, label: 'Submitted', stroke: '#eab308' },
    { key: 'teamsAllocated' as const, label: 'Allocated', stroke: '#22c55e' },
  ];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24" preserveAspectRatio="none">
        {series.map((s) =>
          points.length === 1 ? (
            <circle key={s.key} cx={4} cy={height - (points[0][s.key] / max) * height} r={4} fill={s.stroke} />
          ) : (
            <polyline
              key={s.key}
              points={points.map((p, i) => `${i * stepX},${height - (p[s.key] / max) * height}`).join(' ')}
              fill="none"
              stroke={s.stroke}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          )
        )}
      </svg>
      <div className="flex items-center justify-between mt-2 flex-wrap gap-x-4 gap-y-1">
        <div className="flex items-center gap-3 flex-wrap">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-gray-400">
              <span className="w-2.5 h-0.5 rounded" style={{ backgroundColor: s.stroke }} />
              {s.label}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-gray-600 tabular-nums">
          {points[0].date} → {points[points.length - 1].date}
        </span>
      </div>
    </div>
  );
}

/** One cell of the submission-shape table: teams, then students behind it. */
function ShapeCell({ teams, students }: { teams: number; students: number }) {
  if (teams === 0) return <span className="text-gray-600">—</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className="text-white font-semibold">{teams}</span>
      <span className="text-gray-600"> / </span>
      <span className="text-gray-400">{students}</span>
    </span>
  );
}

/**
 * What each track's teams actually submitted — self-proposed, catalog, or both.
 *
 * Track coverage above says how many submitted; this says what they submitted,
 * which is the question behind mentor review load (only a self-proposed slot 1
 * needs a mentor's sign-off) and behind whether a catalog is being used at all.
 *
 * Counted both ways because the two answer different questions: teams is the
 * unit work happens in, students is the unit a cohort is chased in, and on a
 * team track they are not proportional to each other.
 *
 * Only tracks with a submission appear, and only modes somebody used get a
 * column — a mode a track allows and nobody chose is configuration, and the
 * track-config screen already shows it. Rendering it here as a column of
 * dashes would bury the two columns that carry the answer.
 */
function SubmissionShapes({ tracks }: { tracks: OpsTrackAnalytics[] }) {
  const shapeOf = (track: OpsTrackAnalytics, mode: TrackSubmissionMode) =>
    track.submissionShapes.find((shape) => shape.mode === mode);

  const modes = SUBMISSION_MODE_ORDER.filter((mode) =>
    tracks.some((track) => (shapeOf(track, mode)?.teams ?? 0) > 0)
  );

  const rows = tracks
    .map((track) => ({
      track,
      teams: track.submissionShapes.reduce((sum, shape) => sum + shape.teams, 0),
      students: track.submissionShapes.reduce((sum, shape) => sum + shape.students, 0),
    }))
    .filter((row) => row.teams > 0)
    .sort((a, b) => b.teams - a.teams || a.track.trackName.localeCompare(b.track.trackName));

  const columnTotals = modes.map((mode) => ({
    mode,
    teams: rows.reduce((sum, row) => sum + (shapeOf(row.track, mode)?.teams ?? 0), 0),
    students: rows.reduce((sum, row) => sum + (shapeOf(row.track, mode)?.students ?? 0), 0),
  }));
  const grandTotal = {
    teams: rows.reduce((sum, row) => sum + row.teams, 0),
    students: rows.reduce((sum, row) => sum + row.students, 0),
  };

  return (
    <Panel
      title="What teams submitted, per track"
      note="Every cell is teams / students — a team of four counts once on the left and four times on the right."
    >
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No team has submitted its preferences yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-y-1">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left font-semibold pb-1 pr-3">Track</th>
                {modes.map((mode) => (
                  <th
                    key={mode}
                    className="text-right font-semibold pb-1 px-2 whitespace-nowrap"
                    title={SUBMISSION_MODE_LABELS[mode]}
                  >
                    {SUBMISSION_MODE_SHORT_LABELS[mode]}
                  </th>
                ))}
                <th className="text-right font-semibold pb-1 pl-2 whitespace-nowrap">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.track.trackId} className="bg-zinc-900/60">
                  <td
                    className="py-2 pr-3 pl-2 rounded-l-lg text-white truncate max-w-[220px]"
                    title={row.track.trackName}
                  >
                    {row.track.trackName}
                  </td>
                  {modes.map((mode) => {
                    const shape = shapeOf(row.track, mode);
                    return (
                      <td key={mode} className="py-2 px-2 text-right">
                        <ShapeCell teams={shape?.teams ?? 0} students={shape?.students ?? 0} />
                      </td>
                    );
                  })}
                  <td className="py-2 pl-2 pr-2 rounded-r-lg text-right">
                    <ShapeCell teams={row.teams} students={row.students} />
                  </td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 pr-3 pl-2 text-xs font-semibold text-gray-400">All tracks</td>
                {columnTotals.map((total) => (
                  <td key={total.mode} className="pt-2 px-2 text-right">
                    <ShapeCell teams={total.teams} students={total.students} />
                  </td>
                ))}
                <td className="pt-2 pl-2 pr-2 text-right">
                  <ShapeCell teams={grandTotal.teams} students={grandTotal.students} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-500 mt-3">
        A mode a track allows but nobody chose has no column here — the allowed modes live on the track's
        configuration. Only a self-proposed slot 1 needs a mentor's approval, so the self-assign columns are the
        review workload.
      </p>
    </Panel>
  );
}

function Stat({ value, label, tone = 'text-white' }: { value: number | string; label: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className={`text-xl font-semibold tabular-nums leading-tight ${tone}`}>{value}</p>
      <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{label}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CohortOpsOverview({ cohortId }: { cohortId: string }) {
  const { showError } = useToast();
  const [data, setData] = useState<OpsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [mentorType, setMentorType] = useState<'' | 'internal' | 'external'>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiGetOpsAnalytics(cohortId));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load analytics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    load();
  }, [load]);
  usePageRefresh(load);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <SpinnerSquare size={48} />
      </div>
    );
  }
  if (!data) return null;

  const { progress, tracks, years, mentors } = data;

  // Only mentors this OJT actually staffs somewhere — a mentor on the roster
  // with no track assigned is a staffing gap, counted separately below rather
  // than padding the coverage table with rows nobody can act on.
  const staffedMentors = mentors.rows.filter((m) => m.tracks.length > 0);
  const unstaffedMentors = mentors.rows.length - staffedMentors.length;

  // Filtered in memory rather than on the server, which is the right call only
  // because the whole roster is already here and has to be: every headline on
  // this page (capacity, pending, full, never picked) is computed across all of
  // them. A server-side filter would mean a second request for rows we are
  // holding anyway.
  const visibleMentors = staffedMentors.filter((m) =>
    mentorType === 'internal' ? !m.isExternal : mentorType === 'external' ? m.isExternal : true
  );
  const internalCount = staffedMentors.filter((m) => !m.isExternal).length;
  const visiblePending = visibleMentors.reduce((sum, m) => sum + m.pendingCount, 0);
  const visibleCapacity = visibleMentors.reduce((sum, m) => sum + m.capacity, 0);

  return (
    <div className="space-y-3 overflow-y-auto pb-2">
      <div className="bg-zinc-850 border border-zinc-750 rounded-2xl p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          <Stat value={progress.students} label="students" />
          <Stat value={progress.studentsOnTeam} label="on a team" />
          <Stat value={progress.studentsNotStarted} label="not started" tone="text-red-400" />
          <Stat value={progress.teamsFormed} label="teams formed" />
          {/* Teams and students side by side on purpose: a team of four
              submitting moves one by 1 and the other by 4, and "115 submitted"
              on its own has always been read as students. */}
          <Stat value={progress.teamsSubmitted} label="teams submitted" tone="text-yellow-500" />
          <Stat value={progress.studentsSubmitted} label="students submitted" tone="text-yellow-500" />
          <Stat value={progress.teamsAllocated} label="allocated" tone="text-green-500" />
          <Stat
            value={progress.proposalsPendingReview}
            label="proposals in review"
            tone={progress.proposalsPendingReview > 0 ? 'text-amber-400' : 'text-white'}
          />
        </div>
        {progress.teamsNeedingReview > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-red-400 mt-3">
            <AlertTriangle size={12} />
            {progress.teamsNeedingReview} team{progress.teamsNeedingReview === 1 ? '' : 's'} the allocation run could not settle
          </p>
        )}
      </div>

      <Panel title="Progress" note="Running totals by day — teams formed, preferences submitted, allocations resolved.">
        <ProgressLine points={data.timeline} />
      </Panel>

      {/* Track coverage: every configured track, including the ones nobody
          joined — those are the rows that need acting on. */}
      <Panel
        title="Track coverage"
        note="Every track this OJT offers, and what teams have done with it. A track with no teams was offered and ignored."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-y-1">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left font-semibold pb-1 pr-3">Track</th>
                <th className="text-right font-semibold pb-1 px-2 whitespace-nowrap">Teams</th>
                <th className="text-right font-semibold pb-1 px-2 whitespace-nowrap">Submitted</th>
                <th className="text-right font-semibold pb-1 px-2 whitespace-nowrap">Projects chosen</th>
                <th className="text-right font-semibold pb-1 px-2 whitespace-nowrap">Mentors</th>
                <th className="text-right font-semibold pb-1 px-2 whitespace-nowrap">Picks here</th>
                <th className="text-right font-semibold pb-1 pl-2 whitespace-nowrap">Elsewhere</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr key={track.trackId} className="bg-zinc-900/60">
                  <td className="py-2 pr-3 pl-2 rounded-l-lg text-white truncate max-w-[220px]" title={track.trackName}>
                    {track.trackName}
                  </td>
                  <td className={`py-2 px-2 text-right tabular-nums font-semibold ${track.teamsFormed === 0 ? 'text-gray-600' : 'text-white'}`}>
                    {track.teamsFormed}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-300">{track.teamsSubmitted}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-300 whitespace-nowrap">
                    <span className={track.catalogProjects === 0 ? 'text-red-400' : 'text-white'}>{track.projectsSelected}</span>
                    <span className="text-gray-600"> / {track.catalogProjects}</span>
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-300 whitespace-nowrap">
                    {track.mentorsStaffed}
                    {track.mentorsFull > 0 && <span className="text-red-400"> · {track.mentorsFull} full</span>}
                    {track.mentorsIdle > 0 && <span className="text-gray-600"> · {track.mentorsIdle} unpicked</span>}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-white">{track.mentorPicksHere}</td>
                  <td
                    className={`py-2 pl-2 pr-2 rounded-r-lg text-right tabular-nums ${
                      track.mentorPicksElsewhere > track.mentorPicksHere ? 'text-amber-400' : 'text-gray-500'
                    }`}
                  >
                    {track.mentorPicksElsewhere}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          <span className="text-amber-400">Elsewhere</span> is load this track's mentors are carrying for other tracks.
          Capacity is one number per mentor for the whole OJT, so a track can find its mentors full from demand it never
          generated — adding more mentors there will not help.
        </p>
      </Panel>

      {/* Sits directly under Track coverage: same grain, and it answers the
          question that one raises — those teams submitted, but submitted what. */}
      <SubmissionShapes tracks={tracks} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <BarPanel
          title="Teams per track"
          note="What teams actually chose."
          buckets={tracks.map((t) => ({ label: t.trackName, count: t.teamsFormed }))}
        />
        <BarPanel
          title="Projects chosen per track"
          note="Distinct catalog projects at least one team named, against how many that track offers."
          buckets={tracks.map((t) => ({
            label: t.trackName,
            count: t.projectsSelected,
            suffix: ` / ${t.catalogProjects}`,
          }))}
        />
        <BarPanel
          title="Teams per admission year"
          note="An individual student is a team of one, so this counts everybody."
          buckets={years.map((y) => ({ label: y.year, count: y.teamsFormed }))}
        />
      </div>

      <CrossTab
        title="Teams per track, by admission year"
        note="Which year went where. A dash means that year picked the track zero times."
        cells={years.flatMap((year) =>
          tracks.map((track) => ({
            row: year.year,
            column: track.trackName,
            count: year.byTrack.find((t) => t.trackName === track.trackName)?.teams ?? 0,
          }))
        )}
      />

      <Panel
        title="Mentor coverage"
        note={
          `Tracks each mentor is assigned, how often teams on each picked them, and their capacity. ` +
          `${visiblePending} pending against ${visibleCapacity} capacity` +
          (mentorType ? ` for the ${mentorType === 'internal' ? 'internal' : 'industry'} mentors shown.` : '.')
        }
        action={
          <Select
            variant="filter"
            value={mentorType}
            onChange={(v) => setMentorType(v as '' | 'internal' | 'external')}
            options={[
              { value: 'internal', label: `Internal (${internalCount})` },
              { value: 'external', label: `Industry (${staffedMentors.length - internalCount})` },
            ]}
            placeholder={`All mentors (${staffedMentors.length})`}
            className="min-w-[170px] !text-xs !py-1.5"
          />
        }
      >
        {unstaffedMentors > 0 && (
          <p className="text-[11px] text-amber-400 mb-3">
            {unstaffedMentors} mentor{unstaffedMentors === 1 ? '' : 's'} on the roster are not staffed on any track, so no
            team can pick them.
          </p>
        )}
        {visibleMentors.length === 0 ? (
          <p className="text-sm text-gray-500">
            No {mentorType === 'internal' ? 'internal' : 'industry'} mentors are staffed on any track.
          </p>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-y-1">
            <thead>
              <tr className="text-gray-400">
                <th className="text-left font-semibold pb-1 pr-3">Mentor</th>
                <th className="text-right font-semibold pb-1 px-2 whitespace-nowrap">Tracks</th>
                <th className="text-left font-semibold pb-1 px-2">Chosen on</th>
                <th className="text-right font-semibold pb-1 px-2 whitespace-nowrap">Teams</th>
                <th className="text-right font-semibold pb-1 pl-2 whitespace-nowrap">Capacity</th>
              </tr>
            </thead>
            <tbody>
              {visibleMentors.map((mentor) => {
                const picks = mentor.preference1Count + mentor.preference2Count;
                return (
                  <tr key={mentor.mentorId} className="bg-zinc-900/60 align-top">
                    <td className="py-2 pr-3 pl-2 rounded-l-lg text-white whitespace-nowrap">
                      {mentor.fullName}
                      {mentor.isExternal && <span className="text-gray-600"> · Industry</span>}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-gray-300">{mentor.tracks.length}</td>
                    <td className="py-2 px-2 text-gray-400">
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 max-w-[420px]">
                        {mentor.tracks.map((track) => (
                          <span key={track.trackId} className={track.picks === 0 ? 'text-gray-600' : ''}>
                            {track.trackName} <span className="tabular-nums font-semibold">{track.picks}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={`py-2 px-2 text-right tabular-nums font-semibold ${picks === 0 ? 'text-gray-600' : 'text-white'}`}>
                      {picks}
                    </td>
                    <td className="py-2 pl-2 pr-2 rounded-r-lg text-right whitespace-nowrap">
                      <span
                        className={`tabular-nums font-semibold ${
                          mentor.isFull ? 'text-red-400' : mentor.isNearingCapacity ? 'text-amber-400' : 'text-gray-300'
                        }`}
                      >
                        {mentor.pendingCount}/{mentor.capacity}
                      </span>
                      {mentor.isFull && <span className="text-red-400 font-semibold"> FULL</span>}
                      {mentor.isNearingCapacity && <span className="text-amber-400"> near</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </Panel>
    </div>
  );
}
