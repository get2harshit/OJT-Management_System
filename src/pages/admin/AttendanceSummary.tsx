import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Select from '../../components/Select';
import {
  apiGetCohortAttendance,
  apiExportCohortAttendance,
  apiListMentorsPage,
  type ApiCohortAttendanceRow,
  type CohortAttendanceParams,
  type CohortAttendanceSort,
} from '../../lib/api';
import type { ApiMentor } from '../../lib/types';
import { exportToCSV } from '../../lib/csvExport';
import { useTracks } from '../../hooks/useTracks';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';

const SEARCH_DEBOUNCE_MS = 400;
// Colour bands only. Which students are listed is the admin's own "Below"
// number, not these.
const LOW_ATTENDANCE_PERCENT = 75;
const AT_RISK_PERCENT = 50;

/** The "Below __ %" box as a filter: a number from 0 to 100, or no filter. */
function parseThreshold(raw: string): number | undefined | 'invalid' {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 'invalid';
}

const SORT_OPTIONS: { value: CohortAttendanceSort; label: string }[] = [
  { value: 'percentage', label: 'Lowest attendance first' },
  { value: 'name', label: 'Name A–Z' },
];

function percentageTone(percentage: number): string {
  if (percentage >= LOW_ATTENDANCE_PERCENT) return 'text-green-400';
  if (percentage >= AT_RISK_PERCENT) return 'text-amber-400';
  return 'text-red-400';
}

function formatPercentage(percentage: number | null): string {
  return percentage === null ? '—' : `${Math.round(percentage)}%`;
}

/** Sessions the student was marked in, out of the sessions held for them. */
function markedOf(row: ApiCohortAttendanceRow): string {
  return `${row.present + row.absent + row.excused} of ${row.totalSessions} marked`;
}

export default function AttendanceSummary({ cohortId }: { cohortId: string }) {
  const { showError } = useToast();
  const { options: trackOptions } = useTracks();

  const [rows, setRows] = useState<ApiCohortAttendanceRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [batchOptions, setBatchOptions] = useState<string[]>([]);
  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [mentorId, setMentorId] = useState('');
  // What is typed, and the number the list is filtered by once typing pauses.
  const [thresholdInput, setThresholdInput] = useState('');
  const [belowPercentage, setBelowPercentage] = useState<number | undefined>(undefined);
  const thresholdDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const thresholdInvalid = parseThreshold(thresholdInput) === 'invalid';
  const [sort, setSort] = useState<CohortAttendanceSort>('percentage');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Everything but the page, shared by the table and the export so a file
  // always holds exactly what the filters on screen select.
  const filters = useMemo<CohortAttendanceParams>(
    () => ({
      search: search || undefined,
      batches: selectedBatches.length > 0 ? selectedBatches : undefined,
      tracks: selectedTracks.length > 0 ? selectedTracks : undefined,
      mentorId: mentorId || undefined,
      belowPercentage,
      sort,
    }),
    [search, selectedBatches, selectedTracks, mentorId, belowPercentage, sort]
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetCohortAttendance(cohortId, { ...filters, page, limit });
      setRows(res.data);
      setPagination(res.pagination);
      setBatchOptions(res.batches);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [cohortId, filters, page, limit, showError]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    apiListMentorsPage({ page: 1, limit: 200, cohortId })
      .then((res) => setMentors(res.data))
      .catch(() => setMentors([]));
  }, [cohortId]);

  usePageRefresh(loadRows);

  // Any filter change goes back to page 1, or a narrower result could leave
  // the table on a page that no longer exists.
  const changeFilter = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const handleThresholdChange = (raw: string) => {
    setThresholdInput(raw);
    if (thresholdDebounceRef.current) clearTimeout(thresholdDebounceRef.current);
    const parsed = parseThreshold(raw);
    // Out of range keeps the last good filter and just shows the box in red.
    if (parsed === 'invalid') return;
    thresholdDebounceRef.current = setTimeout(() => {
      setPage(1);
      setBelowPercentage(parsed);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await apiExportCohortAttendance(cohortId, filters);
      exportToCSV(
        `attendance_${cohortId}`,
        all.map((row) => ({
          fullName: row.fullName,
          email: row.email,
          teamName: row.teamName ?? '',
          batch: row.batch ?? '',
          trackName: row.trackName ?? '',
          mentorName: row.mentorName ?? '',
          present: row.present,
          absent: row.absent,
          excused: row.excused,
          notMarked: row.notMarked,
          totalSessions: row.totalSessions,
          percentage: row.percentage === null ? '' : row.percentage,
        })),
        [
          { key: 'fullName', header: 'Student' },
          { key: 'email', header: 'Email' },
          { key: 'teamName', header: 'Team' },
          { key: 'batch', header: 'Batch' },
          { key: 'trackName', header: 'Track' },
          { key: 'mentorName', header: 'Mentor' },
          { key: 'present', header: 'Present' },
          { key: 'absent', header: 'Absent' },
          { key: 'excused', header: 'Excused' },
          { key: 'notMarked', header: 'Not marked' },
          { key: 'totalSessions', header: 'Sessions held' },
          { key: 'percentage', header: 'Attendance %' },
        ]
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to export attendance');
    } finally {
      setExporting(false);
    }
  };

  const mentorOptions = useMemo(
    () => mentors.map((m) => ({ value: m.id, label: m.fullName ?? m.email ?? m.id })),
    [mentors]
  );

  const columns = [
    {
      key: 'fullName',
      header: 'Student',
      render: (row: ApiCohortAttendanceRow) => (
        <div className="leading-tight">
          <div className="text-white font-medium whitespace-nowrap">{row.fullName}</div>
          <div className="text-[11px] text-gray-500">{row.email}</div>
        </div>
      ),
    },
    { key: 'teamName', header: 'Team', render: (row: ApiCohortAttendanceRow) => row.teamName ?? '—' },
    { key: 'batch', header: 'Batch', render: (row: ApiCohortAttendanceRow) => row.batch ?? '—' },
    { key: 'trackName', header: 'Track', render: (row: ApiCohortAttendanceRow) => row.trackName ?? '—' },
    {
      key: 'mentorName',
      header: 'Mentor',
      render: (row: ApiCohortAttendanceRow) => <span className="whitespace-nowrap">{row.mentorName ?? '—'}</span>,
    },
    { key: 'present', header: 'Present' },
    { key: 'absent', header: 'Absent' },
    { key: 'excused', header: 'Excused' },
    { key: 'notMarked', header: 'Not marked' },
    {
      key: 'percentage',
      header: 'Attendance',
      render: (row: ApiCohortAttendanceRow) => (
        <div className="leading-tight whitespace-nowrap">
          <div
            className={`text-sm font-semibold tabular-nums ${row.percentage === null ? 'text-gray-500' : percentageTone(row.percentage)}`}
            title={row.percentage === null ? 'Nothing marked yet' : undefined}
          >
            {formatPercentage(row.percentage)}
          </div>
          {/* The percentage only counts marked sessions, so a 100% from one
              marked session out of twenty has to say so. */}
          <div className="text-[11px] text-gray-500">{markedOf(row)}</div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Attendance % is present ÷ (present + absent). Excused and not-marked sessions are left out, and only
        sessions that have already started are counted.
      </p>
      <DataTable<ApiCohortAttendanceRow>
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Search by name or email..."
        onSearchChange={handleSearchChange}
        // The table's own export only writes the page it holds. This one
        // fetches every matching student first.
        hideExport
        leftHeaderContent={
          <>
            <Select
              variant="filter"
              value={sort}
              onChange={(v) => changeFilter(setSort)(v as CohortAttendanceSort)}
              options={SORT_OPTIONS}
              className="min-w-[170px] !text-xs !py-1.5"
            />
            {batchOptions.length > 0 && (
              <Select
                isMulti
                variant="filter"
                value={selectedBatches}
                onChange={changeFilter(setSelectedBatches)}
                options={batchOptions.map((b) => ({ value: b, label: b }))}
                placeholder="All Batches"
                className="min-w-[130px] !text-xs !py-1.5"
              />
            )}
            <Select
              isMulti
              variant="filter"
              value={selectedTracks}
              onChange={changeFilter(setSelectedTracks)}
              options={trackOptions}
              placeholder="All Tracks"
              className="min-w-[140px] !text-xs !py-1.5"
            />
            <Select
              isSearchable
              variant="filter"
              value={mentorId}
              onChange={changeFilter(setMentorId)}
              options={mentorOptions}
              placeholder="All Mentors"
              className="min-w-[170px] !text-xs !py-1.5"
            />
            <label
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border shrink-0 ${
                thresholdInvalid
                  ? 'border-red-500/50 text-red-400'
                  : belowPercentage !== undefined
                    ? 'border-gold/40 text-gold bg-gold/5'
                    : 'border-zinc-750 text-gray-300 bg-zinc-850'
              }`}
              title={thresholdInvalid ? 'Enter a number from 0 to 100' : 'Only students below this attendance %. Leave empty for everyone.'}
            >
              Below
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={thresholdInput}
                onChange={(e) => handleThresholdChange(e.target.value)}
                placeholder="—"
                aria-label="Attendance below this percentage"
                className="w-12 bg-transparent text-center text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              %
            </label>
            <span className="text-xs text-gray-500 shrink-0">
              {pagination.total} student{pagination.total === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || pagination.total === 0}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors shrink-0 disabled:opacity-50"
            >
              <Download size={13} />
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </>
        }
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          totalPages: pagination.totalPages,
          total: pagination.total,
          onPageChange: setPage,
          onLimitChange: (value) => {
            setPage(1);
            setLimit(value);
          },
        }}
      />
    </div>
  );
}
