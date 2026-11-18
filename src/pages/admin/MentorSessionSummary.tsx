import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Select from '../../components/Select';
import DateRangePicker from '../../components/DateRangePicker';
import AppliedDateRangeNote from '../../components/AppliedDateRangeNote';
import {
  apiGetMentorSessionSummary,
  apiExportMentorSessionSummary,
  type ApiMentorSessionRow,
  type MentorSessionCounts,
  type MentorSessionParams,
  type MentorSessionSort,
} from '../../lib/api';
import { exportToCSV } from '../../lib/csvExport';
import { useTracks } from '../../hooks/useTracks';
import { useDateRangeFilter, dateRangeFileSuffix } from '../../hooks/useDateRangeFilter';
import { useToast } from '../../toast';
import { usePageRefresh } from '../../context/RefreshContext';

const SEARCH_DEBOUNCE_MS = 400;
// Colour bands for the completion percentage only.
const HEALTHY_COMPLETION_PERCENT = 75;
const AT_RISK_COMPLETION_PERCENT = 50;

const SORT_OPTIONS: { value: MentorSessionSort; label: string }[] = [
  { value: 'missed', label: 'Most missed first' },
  { value: 'completion', label: 'Lowest completion first' },
  { value: 'name', label: 'Name A–Z' },
];

const EMPTY_TOTALS: MentorSessionCounts = {
  completed: 0,
  missed: 0,
  upcoming: 0,
  cancelled: 0,
  scheduled: 0,
  completionPercentage: null,
};

function completionTone(percentage: number): string {
  if (percentage >= HEALTHY_COMPLETION_PERCENT) return 'text-green-400';
  if (percentage >= AT_RISK_COMPLETION_PERCENT) return 'text-amber-400';
  return 'text-red-400';
}

function formatPercentage(percentage: number | null): string {
  return percentage === null ? '—' : `${Math.round(percentage)}%`;
}

function TotalsStrip({ totals, mentorCount }: { totals: MentorSessionCounts; mentorCount: number }) {
  const items: { label: string; value: number; tone: string }[] = [
    { label: 'Scheduled', value: totals.scheduled, tone: 'text-white' },
    { label: 'Completed', value: totals.completed, tone: 'text-green-400' },
    { label: 'Missed', value: totals.missed, tone: totals.missed > 0 ? 'text-red-400' : 'text-white' },
    { label: 'Upcoming', value: totals.upcoming, tone: 'text-white' },
    { label: 'Cancelled', value: totals.cancelled, tone: 'text-gray-400' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-400">
      <span>
        Across {mentorCount} mentor{mentorCount === 1 ? '' : 's'}:
      </span>
      {items.map((item) => (
        <span key={item.label}>
          {item.label} <span className={`font-semibold tabular-nums ${item.tone}`}>{item.value}</span>
        </span>
      ))}
      <span>
        Completion{' '}
        <span
          className={`font-semibold tabular-nums ${
            totals.completionPercentage === null ? 'text-gray-500' : completionTone(totals.completionPercentage)
          }`}
        >
          {formatPercentage(totals.completionPercentage)}
        </span>
      </span>
    </div>
  );
}

export default function MentorSessionSummary({ cohortId }: { cohortId: string }) {
  const { showError } = useToast();
  const { options: trackOptions } = useTracks();

  const [rows, setRows] = useState<ApiMentorSessionRow[]>([]);
  const [totals, setTotals] = useState<MentorSessionCounts>(EMPTY_TOTALS);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [sort, setSort] = useState<MentorSessionSort>('missed');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const backToFirstPage = useCallback(() => setPage(1), []);
  const dateRange = useDateRangeFilter(backToFirstPage);

  // Everything but the page, shared by the table and the export so a file
  // always holds exactly what the filters on screen select.
  const filters = useMemo<MentorSessionParams>(
    () => ({
      search: search || undefined,
      tracks: selectedTracks.length > 0 ? selectedTracks : undefined,
      sort,
      from: dateRange.from,
      to: dateRange.to,
    }),
    [search, selectedTracks, sort, dateRange.from, dateRange.to]
  );

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetMentorSessionSummary(cohortId, { ...filters, page, limit });
      setRows(res.data);
      setTotals(res.totals);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load mentor sessions');
    } finally {
      setLoading(false);
    }
  }, [cohortId, filters, page, limit, showError]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  usePageRefresh(loadRows);

  // Any filter change goes back to page 1, or a narrower result could leave
  // the table on a page that no longer exists.
  const changeFilter = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
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
      const allMentors = await apiExportMentorSessionSummary(cohortId, filters);
      exportToCSV(
        `mentor_sessions_${cohortId}${dateRangeFileSuffix(dateRange.appliedRange)}`,
        allMentors.map((row) => ({
          fullName: row.fullName,
          email: row.email,
          scheduled: row.scheduled,
          completed: row.completed,
          missed: row.missed,
          upcoming: row.upcoming,
          cancelled: row.cancelled,
          completionPercentage: row.completionPercentage === null ? '' : row.completionPercentage,
        })),
        [
          { key: 'fullName', header: 'Mentor' },
          { key: 'email', header: 'Email' },
          { key: 'scheduled', header: 'Scheduled' },
          { key: 'completed', header: 'Completed' },
          { key: 'missed', header: 'Missed' },
          { key: 'upcoming', header: 'Upcoming' },
          { key: 'cancelled', header: 'Cancelled' },
          { key: 'completionPercentage', header: 'Completion %' },
        ]
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to export mentor sessions');
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    {
      key: 'fullName',
      header: 'Mentor',
      render: (row: ApiMentorSessionRow) => (
        <div className="leading-tight">
          <div className="text-white font-medium whitespace-nowrap">{row.fullName}</div>
          <div className="text-[11px] text-gray-500">{row.email}</div>
        </div>
      ),
    },
    {
      key: 'scheduled',
      header: 'Scheduled',
      render: (row: ApiMentorSessionRow) => <span className="tabular-nums">{row.scheduled}</span>,
    },
    {
      key: 'completed',
      header: 'Completed',
      render: (row: ApiMentorSessionRow) => <span className="tabular-nums text-green-400">{row.completed}</span>,
    },
    {
      key: 'missed',
      header: 'Missed',
      render: (row: ApiMentorSessionRow) => (
        <span
          className={`tabular-nums ${row.missed > 0 ? 'text-red-400 font-semibold' : 'text-gray-400'}`}
          title="Time has passed, but the session was never marked completed"
        >
          {row.missed}
        </span>
      ),
    },
    {
      key: 'upcoming',
      header: 'Upcoming',
      render: (row: ApiMentorSessionRow) => <span className="tabular-nums">{row.upcoming}</span>,
    },
    {
      key: 'cancelled',
      header: 'Cancelled',
      render: (row: ApiMentorSessionRow) => <span className="tabular-nums text-gray-400">{row.cancelled}</span>,
    },
    {
      key: 'completionPercentage',
      header: 'Completion',
      render: (row: ApiMentorSessionRow) => (
        <div className="leading-tight whitespace-nowrap">
          <div
            className={`text-sm font-semibold tabular-nums ${
              row.completionPercentage === null ? 'text-gray-500' : completionTone(row.completionPercentage)
            }`}
            title={row.completionPercentage === null ? 'No session has come due yet' : undefined}
          >
            {formatPercentage(row.completionPercentage)}
          </div>
          <div className="text-[11px] text-gray-500">
            {row.completed} of {row.completed + row.missed} due
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Counts each mentor&apos;s own sessions only, not co-mentor seats. Missed means the session&apos;s time has passed
        and nobody marked it completed. Scheduled is completed + missed + upcoming; cancelled sessions are left out, and
        completion is completed ÷ (completed + missed).
        <AppliedDateRangeNote range={dateRange.appliedRange} />
      </p>
      <TotalsStrip totals={totals} mentorCount={pagination.total} />
      <DataTable<ApiMentorSessionRow>
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Search mentor by name or email..."
        onSearchChange={handleSearchChange}
        // The table's own export only writes the page it holds. This one
        // fetches every matching mentor first.
        hideExport
        leftHeaderContent={
          <>
            <Select
              variant="filter"
              value={sort}
              onChange={(v) => changeFilter(setSort)(v as MentorSessionSort)}
              options={SORT_OPTIONS}
              className="min-w-[180px] !text-xs !py-1.5"
            />
            <Select
              isMulti
              variant="filter"
              value={selectedTracks}
              onChange={changeFilter(setSelectedTracks)}
              options={trackOptions}
              placeholder="All Tracks"
              className="min-w-[140px] !text-xs !py-1.5"
            />
            {/* No upper bound here: upcoming sessions are part of this view. */}
            <DateRangePicker
              variant="filter"
              clearable
              placeholder="All dates"
              startDate={dateRange.pickedRange.startDate}
              endDate={dateRange.pickedRange.endDate}
              onRangeChange={dateRange.handleRangeChange}
            />
            <span className="text-xs text-gray-500 shrink-0">
              {pagination.total} mentor{pagination.total === 1 ? '' : 's'}
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
