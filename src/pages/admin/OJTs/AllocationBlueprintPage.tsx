import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { LayoutGrid, Plus, Download } from 'lucide-react';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Select from '../../../components/Select';
import Drawer from '../../../components/Drawer';
import DataTable from '../../../components/DataTable';
import CohortPageHeader from './CohortPageHeader';
import type { AllocationBlueprintCounts, AllocationBlueprintStage, AllocationBlueprintStudent, AllocationBlueprintSummary } from '../../../lib/api/allocations';
import type { OpsTeam, OpsTeamStatus } from '../../../lib/api/ops';
import { OPS_TEAM_STATUS_LABELS } from '../../../lib/api/ops';
import { SUBMISSION_MODE_LABELS } from '../../../lib/api/tracks';
import { apiGetCohort, apiGetAllocationBlueprint, apiGetAllocationBlueprintStudents, apiGetOpsFilterOptions, apiGetOpsTeams } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { formatTeamMembers } from '../../../lib/teamLabel';
import { exportToCSV } from '../../../lib/csvExport';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

// Lifecycle order — this is the sequence a student actually moves through.
const STAGE_ORDER: AllocationBlueprintStage[] = [
  'no_team',
  'team_no_preferences',
  'preferences_pending_allocation',
  'allocated_not_published',
  'allocated_published',
];

const STAGE_LABELS: Record<AllocationBlueprintStage, string> = {
  no_team: 'No team yet',
  team_no_preferences: 'Team formed, no project picked',
  preferences_pending_allocation: 'Preferences submitted, allocation pending',
  allocated_not_published: 'Allocated, not published yet',
  allocated_published: 'Allocated & published',
};

// Matches the status-color convention already established elsewhere in the
// app (CohortAllocationsPage's RUN_STATUS_DOT/STATUS_DOT, Submissions'
// PENDING/ACCEPTED/RETURNED) — red=needs attention, gray=neutral/in progress,
// yellow=waiting on something, blue=resolved internally but not published
// yet (same as "draft"), green=done/published.
const STAGE_DOT: Record<AllocationBlueprintStage, string> = {
  no_team: 'bg-red-400',
  team_no_preferences: 'bg-gray-400',
  preferences_pending_allocation: 'bg-yellow-500',
  allocated_not_published: 'bg-blue-400',
  allocated_published: 'bg-green-500',
};

// The headline numbers beside the page title, in lifecycle order.
//
// The unit is spelled out in every label rather than left implied, because
// three of these count teams and one counts students — "1 team" next to a bare
// "487" would read as 487 of the same thing. They are counted on the server;
// nothing here derives a number from the table's own rows, which would only
// ever describe the page currently loaded.
const SUMMARY_ITEMS: { key: keyof AllocationBlueprintSummary; label: string; tone: string }[] = [
  { key: 'notYetStarted', label: 'students not started', tone: 'text-red-400' },
  { key: 'teamsFormed', label: 'teams formed', tone: 'text-gray-300' },
  { key: 'projectsSubmitted', label: 'teams picked a project', tone: 'text-yellow-500' },
  { key: 'allocationDone', label: 'teams allocated', tone: 'text-green-500' },
];

const STAGE_TEXT: Record<AllocationBlueprintStage, string> = {
  no_team: 'text-red-400',
  team_no_preferences: 'text-gray-400',
  preferences_pending_allocation: 'text-yellow-500',
  allocated_not_published: 'text-blue-400',
  allocated_published: 'text-green-500',
};

// Optional columns beyond the always-shown Student Name/Batch/Status — the
// admin picks which of these to add via the "Add Column" drawer. Kept as a
// fixed, ordered list (not the toggle-order the admin clicked in) so the
// table's column order stays stable regardless of the order things were
// turned on/off.
interface OptionalColumn {
  key: string;
  label: string;
  // Plain string, not JSX — shared as-is between the table cell and the CSV
  // export, so there's only one place defining what each column shows.
  value: (s: AllocationBlueprintStudent) => string;
}

const AVAILABLE_COLUMNS: OptionalColumn[] = [
  { key: 'rollNumber', label: 'Roll Number', value: s => s.rollNumber || '—' },
  // "G62 · Rahul_2025 A, Priya_2025 B" — the group number and who is in it.
  //
  // It used to be the group number alone. Both halves earn their place:
  // production names every team (G1…G85) and that is how mentors and ops refer
  // to them, but the number says nothing about who is in the group, which is
  // what someone chasing a student is actually after.
  {
    key: 'team',
    label: 'Team',
    value: s => [s.teamName, formatTeamMembers(s.teamMembers)].filter(Boolean).join(' · ') || '—',
  },
  { key: 'track', label: 'Track', value: s => s.track || '—' },
  { key: 'pref1Project', label: 'Preference 1 (Project)', value: s => s.pref1Project || '—' },
  { key: 'pref2Project', label: 'Preference 2 (Project)', value: s => s.pref2Project || '—' },
  { key: 'allocatedProject', label: 'Allocated Project', value: s => s.allocatedProject || '—' },
  { key: 'pref1Mentor', label: 'Preference 1 Mentor', value: s => s.pref1Mentor || '—' },
  { key: 'pref2Mentor', label: 'Preference 2 Mentor', value: s => s.pref2Mentor || '—' },
  { key: 'allocatedMentor', label: 'Allocated Mentor', value: s => s.allocatedMentor || '—' },
];

// Which unit the table counts in. The page is a student list by default —
// that is the grain the stage lifecycle is defined in — and switches to teams
// for the questions that are really about the group, not the person.
type BlueprintGrain = 'student' | 'team';

const GRAIN_OPTIONS: { value: BlueprintGrain; label: string }[] = [
  { value: 'student', label: 'By student' },
  { value: 'team', label: 'By team' },
];

// Teams have three states to a student's five: a team either hasn't submitted,
// has, or has been allocated. The two the student list splits that this cannot
// are 'no team yet' (no team means no row here at all) and the published/not
// published distinction, which is a property of the OJT rather than the team.
const TEAM_STATUS_ORDER: OpsTeamStatus[] = ['pending', 'submitted', 'allocated'];

const TEAM_STATUS_DOT: Record<OpsTeamStatus, string> = {
  pending: 'bg-gray-400',
  submitted: 'bg-yellow-500',
  allocated: 'bg-green-500',
};

const TEAM_STATUS_TEXT: Record<OpsTeamStatus, string> = {
  pending: 'text-gray-400',
  submitted: 'text-yellow-500',
  allocated: 'text-green-500',
};

interface OptionalTeamColumn {
  key: string;
  label: string;
  value: (t: OpsTeam) => string;
}

// Deliberately parallel to AVAILABLE_COLUMNS above — same labels for the same
// ideas, so switching grain doesn't feel like arriving at a different screen.
const TEAM_AVAILABLE_COLUMNS: OptionalTeamColumn[] = [
  { key: 'track', label: 'Track', value: t => t.trackName || '—' },
  {
    key: 'mode',
    label: 'Submission Mode',
    value: t => (t.submissionMode ? SUBMISSION_MODE_LABELS[t.submissionMode] : '—'),
  },
  { key: 'pref1Project', label: 'Preference 1 (Project)', value: t => t.preference1?.projectTitle || '—' },
  { key: 'pref2Project', label: 'Preference 2 (Project)', value: t => t.preference2?.projectTitle || '—' },
  { key: 'allocatedProject', label: 'Allocated Project', value: t => t.allocatedProjectTitle || '—' },
  { key: 'pref1Mentor', label: 'Preference 1 Mentor', value: t => t.preference1?.mentorName || '—' },
  { key: 'pref2Mentor', label: 'Preference 2 Mentor', value: t => t.preference2?.mentorName || '—' },
  { key: 'allocatedMentor', label: 'Allocated Mentor', value: t => t.allocatedMentorName || '—' },
];

/** "G62 · Rahul_2025 A, Priya_2025 B" — the same label the student grain shows. */
function teamLabel(team: OpsTeam): string {
  return [team.teamName, formatTeamMembers(team.members)].filter(Boolean).join(' · ') || '—';
}

export default function AllocationBlueprintPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showError } = useToast();

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<AllocationBlueprintCounts | null>(null);
  const [summary, setSummary] = useState<AllocationBlueprintSummary | null>(null);

  const [grain, setGrain] = useState<BlueprintGrain>('student');
  const [stageFilter, setStageFilter] = useState<AllocationBlueprintStage | ''>('');
  const [teamStatusFilter, setTeamStatusFilter] = useState<OpsTeamStatus | ''>('');
  // Several batches at once: "who in 2025 A and 2025 B still has no team" is a
  // question about one group, and running it a batch at a time hides how the
  // group compares.
  const [batchFilter, setBatchFilter] = useState<string[]>([]);
  const [trackFilter, setTrackFilter] = useState('');
  const [trackOptions, setTrackOptions] = useState<{ id: string; name: string }[]>([]);
  // The search box belongs to DataTable now, so only the debounced value that
  // the fetch actually runs on is held here.
  const [search, setSearch] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Name/Batch/Status are always shown — everything in AVAILABLE_COLUMNS is
  // an optional extra the admin adds via the "Add Column" drawer, off by
  // default to keep the table lean.
  // One set of toggles per grain. Shared state would let a column turned on in
  // one view silently decide what the other shows, and the two lists aren't
  // even the same — 'Team' is an optional column for a student and the row
  // identity for a team.
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [extraTeamColumns, setExtraTeamColumns] = useState<string[]>([]);
  const [columnsDrawerOpen, setColumnsDrawerOpen] = useState(false);
  const activeColumns = AVAILABLE_COLUMNS.filter(c => extraColumns.includes(c.key));
  const activeTeamColumns = TEAM_AVAILABLE_COLUMNS.filter(c => extraTeamColumns.includes(c.key));
  const toggleColumn = (key: string) => {
    if (grain === 'team') {
      setExtraTeamColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
      return;
    }
    setExtraColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const [students, setStudents] = useState<AllocationBlueprintStudent[]>([]);
  const [teams, setTeams] = useState<OpsTeam[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  const fetchOverview = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    try {
      // Track options come from the OJT's own filter endpoint rather than the
      // cohort record, which carries batches but not tracks.
      const [cohort, data, filterOptions] = await Promise.all([
        apiGetCohort(cohortId),
        apiGetAllocationBlueprint(cohortId),
        apiGetOpsFilterOptions(cohortId),
      ]);
      setCohortLabel(getCohortLabel(cohort));
      setAllowedBatches(cohort.allowedBatches ?? []);
      setTrackOptions(filterOptions.tracks);
      setCounts(data.stages);
      setSummary(data.summary);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load allocation blueprint');
    } finally {
      setLoading(false);
    }
  }, [cohortId, showError]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Batch/track/search mean the same thing to both endpoints and are sent
  // unchanged; only the row grain and its status vocabulary differ. The team
  // endpoint takes the batches as one comma-joined param, the same shape the
  // student one accepts.
  const fetchRows = useCallback(async () => {
    if (!cohortId) return;
    setStudentsLoading(true);
    try {
      if (grain === 'team') {
        const res = await apiGetOpsTeams(cohortId, {
          status: teamStatusFilter || undefined,
          batch: batchFilter.length > 0 ? batchFilter.join(',') : undefined,
          trackId: trackFilter || undefined,
          search: search || undefined,
          page,
          limit,
        });
        setTeams(res.data);
        setPagination(res.pagination);
        return;
      }
      const res = await apiGetAllocationBlueprintStudents(cohortId, {
        stage: stageFilter || undefined,
        batches: batchFilter.length > 0 ? batchFilter : undefined,
        trackId: trackFilter || undefined,
        search: search || undefined,
        page,
        limit,
      });
      setStudents(res.data);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : `Failed to load ${grain === 'team' ? 'teams' : 'students'}`);
    } finally {
      setStudentsLoading(false);
    }
  }, [cohortId, grain, stageFilter, teamStatusFilter, batchFilter, trackFilter, search, page, limit, showError]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  usePageRefresh(useCallback(async () => {
    await Promise.all([fetchOverview(), fetchRows()]);
  }, [fetchOverview, fetchRows]));

  const handleSearchInputChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleStageFilterChange = (value: string) => {
    setStageFilter(value as AllocationBlueprintStage | '');
    setPage(1);
  };

  const handleTeamStatusFilterChange = (value: string) => {
    setTeamStatusFilter(value as OpsTeamStatus | '');
    setPage(1);
  };

  // Both status filters clear on a grain switch. They don't translate — the
  // nearest team equivalent of "No team yet" is no row at all — so carrying a
  // selection across would leave the admin looking at an empty table with a
  // filter that no longer means what they picked.
  const handleGrainChange = (value: string) => {
    setGrain(value as BlueprintGrain);
    setStageFilter('');
    setTeamStatusFilter('');
    setPage(1);
  };

  const handleBatchFilterChange = (value: string[]) => {
    setBatchFilter(value);
    setPage(1);
  };

  const handleTrackFilterChange = (value: string) => {
    setTrackFilter(value);
    setPage(1);
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

  const [exportingCsv, setExportingCsv] = useState(false);
  const handleExportCSV = async () => {
    if (!cohortId) return;
    setExportingCsv(true);
    try {
      const fullSetLimit = Math.max(pagination.total, 1);
      const filename = `allocation_blueprint_${grain}s_${(cohortLabel || cohortId).replace(/\s+/g, '_')}`;

      if (grain === 'team') {
        const res = await apiGetOpsTeams(cohortId, {
          status: teamStatusFilter || undefined,
          batch: batchFilter.length > 0 ? batchFilter.join(',') : undefined,
          trackId: trackFilter || undefined,
          search: search || undefined,
          page: 1,
          limit: fullSetLimit,
        });
        const teamColumns = [
          { key: 'team', header: 'Team' },
          { key: 'status', header: 'Status' },
          ...activeTeamColumns.map(c => ({ key: c.key, header: c.label })),
        ];
        const teamRows = res.data.map(t => {
          const row: Record<string, string> = {
            team: teamLabel(t),
            status: OPS_TEAM_STATUS_LABELS[t.status],
          };
          for (const c of activeTeamColumns) {
            row[c.key] = c.value(t);
          }
          return row;
        });
        exportToCSV(filename, teamRows, teamColumns);
        return;
      }

      // A dedicated fetch sized to the full matching count — one request,
      // not the on-screen page/limit — so the export always has everything
      // currently matching the filters, not just what's visible on screen.
      const res = await apiGetAllocationBlueprintStudents(cohortId, {
        stage: stageFilter || undefined,
        batches: batchFilter.length > 0 ? batchFilter : undefined,
        trackId: trackFilter || undefined,
        search: search || undefined,
        page: 1,
        limit: fullSetLimit,
      });
      const columns = [
        { key: 'fullName', header: 'Student Name' },
        { key: 'batch', header: 'Batch' },
        { key: 'status', header: 'Status' },
        ...activeColumns.map(c => ({ key: c.key, header: c.label })),
      ];
      const rows = res.data.map(s => {
        const row: Record<string, string> = {
          fullName: s.fullName || '',
          batch: s.batch || '',
          status: STAGE_LABELS[s.stage],
        };
        for (const c of activeColumns) {
          row[c.key] = c.value(s);
        }
        return row;
      });
      exportToCSV(filename, rows, columns);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to export CSV');
    } finally {
      setExportingCsv(false);
    }
  };

  const total = counts ? STAGE_ORDER.reduce((sum, s) => sum + counts[s], 0) : 0;

  // Name/Batch/Status always, then whatever the admin added. Built from the
  // same AVAILABLE_COLUMNS entries the CSV export reads, so a column shows the
  // same thing on screen as in the file.
  const columns = useMemo(
    () => [
      {
        key: 'fullName',
        header: 'Student Name',
        render: (s: AllocationBlueprintStudent) => (
          <span className="text-white font-medium">{s.fullName || '—'}</span>
        ),
      },
      {
        key: 'batch',
        header: 'Batch',
        render: (s: AllocationBlueprintStudent) => s.batch || '—',
      },
      {
        key: 'stage',
        header: 'Status',
        render: (s: AllocationBlueprintStudent) => (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STAGE_TEXT[s.stage]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STAGE_DOT[s.stage]}`} />
            {STAGE_LABELS[s.stage]}
          </span>
        ),
      },
      ...activeColumns.map(c => ({
        key: c.key,
        header: c.label,
        render: (s: AllocationBlueprintStudent) => c.value(s),
      })),
    ],
    [activeColumns]
  );

  // The team grain's row identity is the team itself, so it leads — there is
  // no separate name column the way the student grain has one.
  const teamColumns = useMemo(
    () => [
      {
        key: 'team',
        header: 'Team',
        render: (t: OpsTeam) => <span className="text-white font-medium">{teamLabel(t)}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (t: OpsTeam) => (
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${TEAM_STATUS_TEXT[t.status]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${TEAM_STATUS_DOT[t.status]}`} />
            {OPS_TEAM_STATUS_LABELS[t.status]}
            {/* An allocation run left this one unsettled. It reads as
                'Submitted' above, so it has to be said separately or it
                disappears among teams that are simply waiting. */}
            {t.allocationStatus === 'needs_review' && (
              <span className="text-[10px] text-red-400 font-semibold">· needs review</span>
            )}
          </span>
        ),
      },
      ...activeTeamColumns.map(c => ({
        key: c.key,
        header: c.label,
        render: (t: OpsTeam) => c.value(t),
      })),
    ],
    [activeTeamColumns]
  );

  // Shared by both grains' tables so the filter bar can't drift between them.
  // The only grain-dependent parts are the status dropdown's vocabulary, the
  // row-count chip's unit, and the track note (which is about students without
  // a team — a thing the team grain has none of).
  const filterBar = (
    <>
      <Select
        variant="filter"
        value={grain}
        onChange={v => handleGrainChange(v as string)}
        options={GRAIN_OPTIONS.map(g => ({ value: g.value, label: g.label }))}
        className="min-w-[130px] !text-xs !py-1.5"
      />
      {grain === 'team' ? (
        <Select
          variant="filter"
          value={teamStatusFilter}
          onChange={v => handleTeamStatusFilterChange(v as string)}
          options={TEAM_STATUS_ORDER.map(s => ({ value: s, label: OPS_TEAM_STATUS_LABELS[s] }))}
          placeholder="All Statuses"
          className="min-w-[160px] !text-xs !py-1.5"
        />
      ) : (
        <Select
          variant="filter"
          value={stageFilter}
          onChange={v => handleStageFilterChange(v as string)}
          options={STAGE_ORDER.map(s => ({ value: s, label: STAGE_LABELS[s] }))}
          placeholder="All Statuses"
          className="min-w-[160px] !text-xs !py-1.5"
        />
      )}
      {allowedBatches.length > 0 && (
        <Select
          isMulti
          variant="filter"
          value={batchFilter}
          onChange={handleBatchFilterChange}
          options={allowedBatches.map(b => ({ value: b, label: b }))}
          placeholder="All Batches"
          className="min-w-[140px] !text-xs !py-1.5"
        />
      )}
      {trackOptions.length > 0 && (
        <Select
          variant="filter"
          value={trackFilter}
          onChange={v => handleTrackFilterChange(v as string)}
          options={trackOptions.map(t => ({ value: t.id, label: t.name }))}
          placeholder="All Tracks"
          className="min-w-[150px] !text-xs !py-1.5"
        />
      )}
      {grain === 'team'
        ? summary && (
            <span className="text-xs text-gray-500 shrink-0">
              {summary.teamsFormed} team{summary.teamsFormed === 1 ? '' : 's'}
            </span>
          )
        : counts && (
            <span className="text-xs text-gray-500 shrink-0">{total} student{total === 1 ? '' : 's'}</span>
          )}
      {/* A track belongs to a team, so filtering by one drops everybody
          who hasn't joined a team — which is the whole "No team yet"
          stage. Said out loud, because the alternative is an empty
          table that reads as a bug. Meaningless in the team grain, where
          every row has a team by definition. */}
      {grain === 'student' && trackFilter && (
        <span className="text-xs text-amber-400/80 shrink-0">
          Track filter excludes students with no team
        </span>
      )}
      <button
        onClick={handleExportCSV}
        disabled={exportingCsv || pagination.total === 0}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors shrink-0 disabled:opacity-50"
      >
        <Download size={13} />
        {exportingCsv ? 'Exporting...' : 'Export CSV'}
      </button>
    </>
  );

  const serverPagination = {
    page: pagination.page,
    limit: pagination.limit,
    totalPages: pagination.totalPages,
    total: pagination.total,
    onPageChange: setPage,
    onLimitChange: handleLimitChange,
  };

  return (
    <PageLayout className="space-y-3">
      <CohortPageHeader
        title="Allocation Blueprint"
        subtitle={cohortLabel || undefined}
        icon={LayoutGrid}
        trailing={
          <>
            {summary && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 ml-1">
                {SUMMARY_ITEMS.map(item => (
                  <span key={item.key} className="flex items-baseline gap-1.5">
                    {/* The number is the thing being scanned, so it carries the
                        size and the colour; the label stays quiet behind it. */}
                    <span className={`text-base font-semibold tabular-nums leading-none ${item.tone}`}>
                      {summary[item.key]}
                    </span>
                    <span className="text-xs text-gray-500 leading-none">{item.label}</span>
                  </span>
                ))}
              </div>
            )}
            {/* Up here rather than in the table's filter bar: this changes the
                table's shape, it isn't another way to narrow the rows, and
                sitting among the filters it read as one. `ml-auto` claims the
                right edge of the header row. */}
            <button
              onClick={() => setColumnsDrawerOpen(true)}
              className="ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-zinc-850 border border-zinc-750 rounded-lg text-gray-300 hover:text-white hover:border-gold/40 transition-colors shrink-0"
            >
              <Plus size={13} />
              Customize Columns
            </button>
          </>
        }
      />

      {loading ? (
        <div className="min-h-[40vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : grain === 'team' ? (
        <DataTable<OpsTeam>
          columns={teamColumns}
          data={teams}
          loading={studentsLoading}
          searchPlaceholder="Search by team, member or project..."
          onSearchChange={handleSearchInputChange}
          hideExport
          leftHeaderContent={filterBar}
          serverPagination={serverPagination}
        />
      ) : (
        <DataTable<AllocationBlueprintStudent>
          columns={columns}
          data={students}
          loading={studentsLoading}
          searchPlaceholder="Search by name or roll number..."
          onSearchChange={handleSearchInputChange}
          /* The table's own export writes the rows it currently holds, which
             here is one page. This page's button fetches the whole filtered
             set first, so it stays. */
          hideExport
          leftHeaderContent={filterBar}
          serverPagination={serverPagination}
        />
      )}

      <Drawer open={columnsDrawerOpen} onClose={() => setColumnsDrawerOpen(false)} title="Customize Columns" widthClassName="max-w-xs">
        <div className="space-y-0.5">
          {(grain === 'team' ? TEAM_AVAILABLE_COLUMNS : AVAILABLE_COLUMNS).map(c => {
            const active = (grain === 'team' ? extraTeamColumns : extraColumns).includes(c.key);
            return (
              <button
                key={c.key}
                onClick={() => toggleColumn(c.key)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left border-l-2 transition-colors ${
                  active
                    ? 'border-gold bg-gold/10 text-white font-medium'
                    : 'border-transparent text-gray-300 hover:bg-gold/5 hover:text-white hover:border-gold/30'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </Drawer>
    </PageLayout>
  );
}
