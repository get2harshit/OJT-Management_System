import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { UserPlus, Check } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import DataTable from '../../../components/DataTable';
import Select from '../../../components/Select';
import type { ApiCandidateStudent } from '../../../lib/api/tracks';
import { apiGetCohort, apiGetTrackCandidateStudents, apiAddEligibleStudents } from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useTracks } from '../../../hooks/useTracks';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

// Colour the performance number so a scan reads at a glance — high performers
// green, mid amber, low red, and a muted dash when a student has no imported
// score at all.
function performanceClass(pct: number | null): string {
  if (pct === null) return 'text-gray-500';
  if (pct >= 80) return 'text-emerald-400';
  if (pct >= 60) return 'text-amber-400';
  return 'text-red-400';
}

type CandidateRow = ApiCandidateStudent & Record<string, unknown> & { id: string };

// The "Specific students" track picker. Reached from the person-plus icon on a
// unique track's row in Track Configuration. Lists the cohort's students with
// their imported academic performance so an admin can filter (e.g. 90%+ / by
// batch / search) and multi-select students to add to this track's eligible
// list. Selection is kept in a Set that survives paging and filtering, so a
// group can be built across several filtered views before adding in one go.
export default function TrackEligibleStudentsPage() {
  const { cohortId, trackSlug } = useParams<{ cohortId: string; trackSlug: string }>();
  // Which configuration of the track this list belongs to — two
  // configurations of one track each name their own students. Absent for a
  // track with a single configuration, which the server resolves on its own.
  const [searchParams] = useSearchParams();
  // Guarded against the literal strings a bad interpolation produces —
  // ?configId=undefined must read as "not specified", not as an id.
  const rawConfigId = searchParams.get('configId');
  const configId =
    rawConfigId && rawConfigId !== 'undefined' && rawConfigId !== 'null' ? rawConfigId : undefined;
  const { showSuccess, showError } = useToast();
  const { tracks } = useTracks();
  const trackName = trackSlug ? (tracks.find((t) => t.slug === trackSlug)?.name ?? trackSlug) : '';

  const [cohortLabel, setCohortLabel] = useState('');
  const [allowedBatches, setAllowedBatches] = useState<string[]>([]);

  const [rows, setRows] = useState<CandidateRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [minPerformance, setMinPerformance] = useState('');
  const [minPerformanceInput, setMinPerformanceInput] = useState('');

  // Selected studentIds — persists across pages/filters so a group can be
  // assembled from several filtered views, then added all at once.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const perfDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadCohort = useCallback(() => {
    if (!cohortId) return Promise.resolve();
    return apiGetCohort(cohortId)
      .then((c) => {
        setCohortLabel(getCohortLabel(c));
        setAllowedBatches(c.allowedBatches ?? []);
      })
      .catch(() => {});
  }, [cohortId]);

  const fetchPage = useCallback(async () => {
    if (!cohortId || !trackSlug) return;
    try {
      const res = await apiGetTrackCandidateStudents(cohortId, trackSlug, {
        page,
        limit,
        search: search || undefined,
        batch: batchFilter || undefined,
        minPerformance: minPerformance !== '' ? Number(minPerformance) : undefined,
      }, configId);
      setRows(res.data.map((s) => ({ ...s, id: s.studentId })));
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load students');
    }
  }, [cohortId, trackSlug, configId, page, limit, search, batchFilter, minPerformance, showError]);

  useEffect(() => {
    loadCohort();
  }, [loadCohort]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  usePageRefresh(useCallback(() => Promise.all([loadCohort(), fetchPage()]), [loadCohort, fetchPage]));

  const handleSearch = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleMinPerformanceChange = (value: string) => {
    setMinPerformanceInput(value);
    if (perfDebounceRef.current) clearTimeout(perfDebounceRef.current);
    perfDebounceRef.current = setTimeout(() => {
      setPage(1);
      setMinPerformance(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleBatchChange = (value: string) => {
    setPage(1);
    setBatchFilter(value);
  };

  const toggleOne = (row: CandidateRow) => {
    if (row.alreadyEligible) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.studentId)) next.delete(row.studentId);
      else next.add(row.studentId);
      return next;
    });
  };

  // Selectable = not already on the track. Select-all header toggles just the
  // selectable rows on the current page, leaving other pages' picks untouched.
  const selectableIds = rows.filter((r) => !r.alreadyEligible).map((r) => r.studentId);
  const allPageSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleAdd = async () => {
    if (!cohortId || !trackSlug || selected.size === 0) return;
    setAdding(true);
    try {
      const res = await apiAddEligibleStudents(
        cohortId,
        trackSlug,
        { studentIds: Array.from(selected) },
        configId
      );
      showSuccess(`${res.added} student${res.added === 1 ? '' : 's'} added to ${trackName}`);
      setSelected(new Set());
      await fetchPage();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add students');
    } finally {
      setAdding(false);
    }
  };

  const batchOptions = [{ value: '', label: 'Any batch' }, ...allowedBatches.map((b) => ({ value: b, label: b }))];

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col">
      <CohortPageHeader
        title={`${trackName} — Select Students`}
        subtitle={cohortLabel ? `${cohortLabel} · add specific students to this track` : undefined}
        icon={UserPlus}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-400">
          {selected.size > 0
            ? `${selected.size} student${selected.size === 1 ? '' : 's'} selected`
            : 'Filter by performance, batch or search, then select students to add.'}
        </p>
        <button
          onClick={handleAdd}
          disabled={selected.size === 0 || adding}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <UserPlus size={16} />
          {adding ? 'Adding...' : `Add ${selected.size || ''} to track`.trim()}
        </button>
      </div>

      <DataTable<CandidateRow>
        columns={[
          {
            key: 'select',
            header: '',
            headerRender: () => (
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={toggleAllOnPage}
                title="Select all on this page"
                className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold cursor-pointer"
              />
            ),
            render: (row) =>
              row.alreadyEligible ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                  <Check size={13} /> Added
                </span>
              ) : (
                <input
                  type="checkbox"
                  readOnly
                  checked={selected.has(row.studentId)}
                  className="rounded bg-zinc-750 border-zinc-650 accent-gold pointer-events-none"
                />
              ),
          },
          { key: 'fullName', header: 'Name', render: (row) => <span className="text-white">{row.fullName || '—'}</span> },
          { key: 'registrationNumber', header: 'Reg No', render: (row) => <span className="font-mono text-xs text-gray-300">{row.registrationNumber || '—'}</span> },
          { key: 'batch', header: 'Batch', render: (row) => <span className="text-gray-300">{row.batch || '—'}</span> },
          { key: 'email', header: 'Email', render: (row) => <span className="text-xs text-gray-400 truncate block max-w-[220px]">{row.email || '—'}</span> },
          {
            key: 'performancePercentage',
            header: 'Performance',
            render: (row) => (
              <span className={`font-semibold tabular-nums ${performanceClass(row.performancePercentage)}`}>
                {row.performancePercentage !== null ? `${row.performancePercentage}%` : '—'}
              </span>
            ),
          },
        ]}
        data={rows}
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          totalPages: pagination.totalPages,
          onPageChange: setPage,
          limitOptions: [20, 40, 80],
          onLimitChange: (l) => {
            setLimit(l);
            setPage(1);
          },
        }}
        onSearchChange={handleSearch}
        onRowClick={toggleOne}
        searchPlaceholder="Search name, roll, reg or email..."
        hideExport
        leftHeaderContent={
          <div className="flex items-center gap-2">
            <Select value={batchFilter} onChange={(v) => handleBatchChange(v as string)} options={batchOptions} className="w-36" />
            <div className="flex items-center gap-1.5 px-2.5 py-2 bg-zinc-800 border border-zinc-700 rounded-lg">
              <span className="text-xs text-gray-500 whitespace-nowrap">Min %</span>
              <input
                type="number"
                min={0}
                max={100}
                value={minPerformanceInput}
                onChange={(e) => handleMinPerformanceChange(e.target.value)}
                placeholder="e.g. 90"
                className="w-16 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
              />
            </div>
          </div>
        }
      />
    </div>
  );
}
