import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import DataTable from '../../../components/DataTable';
import PageLayout from '../../../components/PageLayout';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import SkillAssessmentPanel from '../../../components/SkillAssessmentPanel';
import {
  apiListCohortAssessments,
  type ApiCohortStudentAssessment,
  type CohortAssessmentSort,
} from '../../../lib/api/skillAssessments';
import { useToast } from '../../../toast';
import { formatInIST } from '../../../lib/utils';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

/**
 * Sort and direction as one control.
 *
 * DataTable has no sortable headers and this page does not add them — the
 * convention here is a Select driving a server-side `sort` param, the same way
 * the task list already works. Pairing each field with its useful direction in
 * one list also keeps the reader from having to think about "ascending" when
 * what they mean is "weakest first".
 */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'name:asc', label: 'Name (A–Z)' },
  { value: 'finalRating:desc', label: 'Overall — strongest first' },
  { value: 'finalRating:asc', label: 'Overall — needs most support first' },
  { value: 'technicalUnderstanding:asc', label: 'Technical Understanding — weakest first' },
  { value: 'engineeringExecution:asc', label: 'Engineering Execution — weakest first' },
  { value: 'professionalCapability:asc', label: 'Professional Capability — weakest first' },
  { value: 'communication:asc', label: 'Communication — weakest first' },
  { value: 'assessedAt:desc', label: 'Recently assessed' },
];

const ASSESSED_OPTIONS = [
  { value: '', label: 'Everyone' },
  { value: 'no', label: 'Not yet assessed' },
  { value: 'yes', label: 'Assessed' },
];

/** A dimension figure, or a dash — never a 0, which would read as a real rating. */
function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-600">—</span>;
  return <span className="text-white font-semibold tabular-nums">{value.toFixed(2)}</span>;
}

export default function CohortAssessmentsPage() {
  const { cohortId = '' } = useParams();
  const { showError } = useToast();

  const [rows, setRows] = useState<ApiCohortStudentAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });

  const [search, setSearch] = useState('');
  const [assessed, setAssessed] = useState('');
  const [sortValue, setSortValue] = useState('name:asc');
  const [selected, setSelected] = useState<ApiCohortStudentAssessment | null>(null);

  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(async () => {
    if (!cohortId) return;
    setLoading(true);
    const [sort, order] = sortValue.split(':') as [CohortAssessmentSort, 'asc' | 'desc'];
    try {
      const res = await apiListCohortAssessments(cohortId, {
        page,
        limit,
        search: search || undefined,
        assessed: (assessed as 'yes' | 'no') || undefined,
        sort,
        order,
      });
      setRows(res.data);
      setPagination({ total: res.pagination.total, totalPages: res.pagination.totalPages });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  }, [cohortId, page, limit, search, assessed, sortValue, showError]);

  useEffect(() => {
    load();
  }, [load]);

  usePageRefresh(load);

  // Every filter change resets to page 1 — staying on page 7 of a list that
  // just became two pages long shows an empty table.
  const handleSearchChange = (value: string) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
  };

  const columns = [
    {
      key: 'student',
      header: 'Student',
      render: (row: ApiCohortStudentAssessment) => (
        <div className="min-w-0">
          <p className="text-white font-medium truncate">{row.fullName ?? '—'}</p>
          <p className="text-[11px] text-gray-500 truncate">
            {row.rollNumber ?? '—'}
            {row.teamName ? ` · ${row.teamName}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'mentor',
      header: 'Mentor',
      render: (row: ApiCohortStudentAssessment) => (
        <span className="text-gray-400 text-xs">{row.mentorName ?? '—'}</span>
      ),
    },
    { key: 'tu', header: 'Technical', render: (row: ApiCohortStudentAssessment) => <Score value={row.technicalUnderstanding} /> },
    { key: 'ee', header: 'Execution', render: (row: ApiCohortStudentAssessment) => <Score value={row.engineeringExecution} /> },
    { key: 'pc', header: 'Professional', render: (row: ApiCohortStudentAssessment) => <Score value={row.professionalCapability} /> },
    {
      key: 'communication',
      header: 'Communication',
      render: (row: ApiCohortStudentAssessment) =>
        row.communication === null ? (
          <span className="text-gray-600">—</span>
        ) : (
          <span className="text-white font-semibold tabular-nums">{row.communication}</span>
        ),
    },
    {
      key: 'final',
      header: 'Overall',
      render: (row: ApiCohortStudentAssessment) =>
        row.finalRating === null ? (
          <span className="text-gray-600">not assessed</span>
        ) : (
          <span className="text-gold font-bold tabular-nums">{row.finalRating.toFixed(2)}</span>
        ),
    },
    {
      key: 'assessedAt',
      header: 'Last rated',
      render: (row: ApiCohortStudentAssessment) => (
        <span className="text-gray-400 text-xs">
          {row.assessedAt ? formatInIST(row.assessedAt, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
        </span>
      ),
    },
  ];

  return (
    <PageLayout className="space-y-4">
      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Search by name or roll number…"
        onSearchChange={handleSearchChange}
        onRowClick={(row: ApiCohortStudentAssessment) => setSelected(row)}
        exportFilename="cohort-assessments"
        serverPagination={{
          page,
          limit,
          total: pagination.total,
          totalPages: pagination.totalPages,
          onPageChange: setPage,
          onLimitChange: (next: number) => {
            setLimit(next);
            setPage(1);
          },
        }}
        leftHeaderContent={
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              variant="filter"
              className="min-w-[150px]"
              value={assessed}
              onChange={(value) => {
                setAssessed(value as string);
                setPage(1);
              }}
              placeholder="Everyone"
              options={ASSESSED_OPTIONS}
            />
            <Select
              variant="filter"
              className="min-w-[240px]"
              value={sortValue}
              onChange={(value) => {
                setSortValue(value as string);
                setPage(1);
              }}
              options={SORT_OPTIONS}
            />
          </div>
        }
      />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.fullName ?? 'Assessment'}
        size="lg"
      >
        {selected && (
          <div className="space-y-1">
            <p className="text-xs text-gray-500">
              {selected.rollNumber ?? '—'}
              {selected.teamName ? ` · ${selected.teamName}` : ''}
              {selected.mentorName ? ` · mentored by ${selected.mentorName}` : ''}
            </p>
            {/* Read-only by construction: the panel only ever displays a
                history now, and an admin id is not a row of ojt_mentors, so
                an admin-authored assessment is not something the schema
                could represent even if a write action were added here. */}
            <SkillAssessmentPanel studentId={selected.studentId} cohortId={cohortId} />
          </div>
        )}
      </Modal>
    </PageLayout>
  );
}
