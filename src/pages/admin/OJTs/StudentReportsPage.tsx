import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, ExternalLink, Eye, FileText } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import PageLayout from '../../../components/PageLayout';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import {
  apiGetStudentReport,
  apiExportStudentReport,
  apiListMentorsPage,
  apiGetPrdDownloadUrl,
  type StudentReportRow,
  type StudentReportTaskCell,
  type StudentReportTaskColumn,
  type StudentReportRatingColumn,
  type StudentReportEvaluationColumn,
  type StudentReportParams,
} from '../../../lib/api';
import { apiListTasks } from '../../../lib/api/tasks';
import type { ApiMentor } from '../../../lib/types';
import { exportToCSV } from '../../../lib/csvExport';
import { submissionStatusLabel, statusDotClass } from '../../../lib/submissionDisplay';
import { formatInIST } from '../../../lib/utils';
import { useTracks } from '../../../hooks/useTracks';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const SEARCH_DEBOUNCE_MS = 400;
// The server reads at most 50 of any list. An OJT has ~30 admin tasks today,
// so every one of them fits.
const MAX_TASK_COLUMNS = 50;
// Colour bands only, the same ones the attendance summary uses.
const LOW_ATTENDANCE_PERCENT = 75;
const AT_RISK_PERCENT = 50;

const TASK_STATE_LABEL = {
  pending: 'Pending',
  not_submitted: 'Not submitted',
  not_assigned: 'Not assigned',
} as const;

// The chosen task and rating columns are a per-admin view setting, so they
// live in this browser only. Storage can be missing or blocked; the page
// works without it.
type SavedColumnKind = 'taskColumns' | 'ratingColumns';

function savedColumnsKey(kind: SavedColumnKind, cohortId: string) {
  return `studentReports:${kind}:${cohortId}`;
}

function readSavedColumns(kind: SavedColumnKind, cohortId: string): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(savedColumnsKey(kind, cohortId)) ?? '[]');
    return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveColumns(kind: SavedColumnKind, cohortId: string, columns: string[]) {
  try {
    localStorage.setItem(savedColumnsKey(kind, cohortId), JSON.stringify(columns));
  } catch {
    // Not remembered next time; nothing else depends on it.
  }
}

/** A 1-5 framework rating, two decimals at most ("1.8", "3.33", "4"). */
function formatRating(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(Math.round(value * 100) / 100);
}

// Colour bands on the framework's scale: 4 is "Independent", below 3 is
// "Not Ready" or under.
function ratingTone(value: number): string {
  if (value >= 4) return 'text-green-400';
  if (value >= 3) return 'text-amber-400';
  return 'text-red-400';
}

/**
 * How many rows the project cells span, starting at each row. A team's rows
 * arrive together, so the run of rows sharing its group (and project) gets
 * one cell; 0 marks a row an earlier cell already covers.
 */
function projectRowSpans(rows: StudentReportRow[]): number[] {
  const sameProjectGroup = (a: StudentReportRow, b: StudentReportRow) =>
    a.groupKey === b.groupKey && a.projectId === b.projectId;
  return rows.map((row, i) => {
    if (i > 0 && sameProjectGroup(rows[i - 1], row)) return 0;
    let span = 1;
    while (i + span < rows.length && sameProjectGroup(rows[i + span], row)) span++;
    return span;
  });
}

function percentageTone(percentage: number): string {
  if (percentage >= LOW_ATTENDANCE_PERCENT) return 'text-green-400';
  if (percentage >= AT_RISK_PERCENT) return 'text-amber-400';
  return 'text-red-400';
}

function formatPercentage(percentage: number | null): string {
  return percentage === null ? '—' : `${Math.round(percentage)}%`;
}

function formatMarks(row: StudentReportRow, column: StudentReportEvaluationColumn): string {
  const evaluation = row.evaluations[column.configId];
  if (!evaluation) return '—';
  if (evaluation.attendance === 'absent') return 'Absent';
  if (evaluation.attendance === 'excused') return 'Excused';
  return evaluation.marks === null ? 'Not scored' : `${evaluation.marks}/${column.maxMarks}`;
}

/** What a task cell says in the CSV: the link itself when there is one. */
function taskCellExportValue(cell: StudentReportTaskCell | undefined): string {
  if (!cell) return '';
  if (cell.state !== 'submitted') return TASK_STATE_LABEL[cell.state];
  if (cell.links.length > 0) return cell.links.join(' | ');
  if (cell.downloadUrl) return cell.downloadUrl;
  if (cell.text) return cell.text;
  return 'Submitted';
}

function TaskCell({ cell }: { cell: StudentReportTaskCell | undefined }) {
  const { showError } = useToast();
  const [opening, setOpening] = useState(false);
  if (!cell || cell.state === 'not_assigned') {
    return <span className="text-gray-600" title="Not assigned this task">—</span>;
  }
  if (cell.state === 'pending') return <span className="text-amber-400 whitespace-nowrap">Pending</span>;
  if (cell.state === 'not_submitted') return <span className="text-red-400 whitespace-nowrap">Not submitted</span>;

  const openFile = async () => {
    if (!cell.submissionId) return;
    setOpening(true);
    try {
      window.open(await apiGetPrdDownloadUrl(cell.submissionId), '_blank', 'noopener,noreferrer');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not open the file');
    } finally {
      setOpening(false);
    }
  };
  const tone = cell.reviewStatus ? statusDotClass(cell.reviewStatus) : null;

  return (
    <div className="leading-tight space-y-0.5 max-w-[220px]">
      {cell.links.map((link) => (
        <a
          key={link}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          title={link}
          className="flex items-center gap-1 text-gold hover:underline truncate"
        >
          <ExternalLink size={12} className="shrink-0" />
          <span className="truncate">{link.replace(/^https?:\/\//, '')}</span>
        </a>
      ))}
      {cell.hasFile && (
        <button
          type="button"
          onClick={openFile}
          disabled={opening}
          className="flex items-center gap-1 text-gold hover:underline disabled:opacity-50"
        >
          <FileText size={12} className="shrink-0" />
          {opening ? 'Opening…' : cell.submissionType === 'video' ? 'Open video' : 'Open file'}
        </button>
      )}
      {cell.text && (
        <p className="text-gray-300 line-clamp-2" title={cell.text}>
          {cell.text}
        </p>
      )}
      {cell.reviewStatus && tone && (
        <div className={`flex items-center gap-1 text-[11px] ${tone.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
          {submissionStatusLabel(cell.reviewStatus)}
        </div>
      )}
    </div>
  );
}

export default function StudentReportsPage() {
  const { cohortId = '' } = useParams<{ cohortId: string }>();
  const { showError } = useToast();
  const { options: trackOptions } = useTracks();

  const [rows, setRows] = useState<StudentReportRow[]>([]);
  const [taskColumns, setTaskColumns] = useState<StudentReportTaskColumn[]>([]);
  const [ratingColumns, setRatingColumns] = useState<StudentReportRatingColumn[]>([]);
  const [ratingOptions, setRatingOptions] = useState<StudentReportRatingColumn[]>([]);
  const [evaluationColumns, setEvaluationColumns] = useState<StudentReportEvaluationColumn[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [batchOptions, setBatchOptions] = useState<string[]>([]);
  const [mentors, setMentors] = useState<ApiMentor[]>([]);
  const [taskOptions, setTaskOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  // The project whose full description is open; the cell itself is clamped.
  const [viewingProject, setViewingProject] = useState<{ title: string; description: string } | null>(null);

  const [search, setSearch] = useState('');
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [selectedMentorIds, setSelectedMentorIds] = useState<string[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(() => readSavedColumns('taskColumns', cohortId));
  const [selectedRatingKeys, setSelectedRatingKeys] = useState<string[]>(() => readSavedColumns('ratingColumns', cohortId));
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // The tab bar keeps this page mounted when the OJT switches, so the saved
  // columns are reread for the new one.
  useEffect(() => {
    setSelectedTaskIds(readSavedColumns('taskColumns', cohortId));
    setSelectedRatingKeys(readSavedColumns('ratingColumns', cohortId));
    setPage(1);
  }, [cohortId]);

  // Everything but the page, shared by the table and the export so a file
  // always holds exactly what the screen selects.
  const filters = useMemo<StudentReportParams>(
    () => ({
      search: search || undefined,
      batches: selectedBatches.length > 0 ? selectedBatches : undefined,
      tracks: selectedTracks.length > 0 ? selectedTracks : undefined,
      mentorIds: selectedMentorIds.length > 0 ? selectedMentorIds : undefined,
      taskIds: selectedTaskIds.length > 0 ? selectedTaskIds : undefined,
      ratingKeys: selectedRatingKeys.length > 0 ? selectedRatingKeys : undefined,
    }),
    [search, selectedBatches, selectedTracks, selectedMentorIds, selectedTaskIds, selectedRatingKeys]
  );

  // Quick toggles start overlapping requests; only the latest may land, or an
  // older response would put back a column the admin just removed.
  const latestRequestRef = useRef(0);

  const loadReport = useCallback(async () => {
    if (!cohortId) return;
    const requestId = ++latestRequestRef.current;
    setLoading(true);
    try {
      const report = await apiGetStudentReport(cohortId, { ...filters, page, limit });
      if (requestId !== latestRequestRef.current) return;
      setRows(report.rows);
      setTaskColumns(report.taskColumns);
      setRatingColumns(report.ratingColumns);
      setRatingOptions(report.ratingOptions);
      setEvaluationColumns(report.evaluationColumns);
      setPagination(report.pagination);
      setBatchOptions(report.batches);
    } catch (err) {
      if (requestId === latestRequestRef.current) {
        showError(err instanceof Error ? err.message : 'Failed to load student reports');
      }
    } finally {
      if (requestId === latestRequestRef.current) setLoading(false);
    }
  }, [cohortId, filters, page, limit, showError]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  usePageRefresh(loadReport);

  useEffect(() => {
    if (!cohortId) return;
    apiListMentorsPage({ page: 1, limit: 200, cohortId })
      .then((res) => setMentors(res.data))
      .catch(() => setMentors([]));
    // Admin-assigned student tasks only; the server ignores any other id too.
    apiListTasks({ cohort_id: cohortId, target_role: 'student', assigned_by_role: 'admin', sort: 'created_at', limit: 200 })
      .then((res) => {
        setTaskOptions(res.data.map((task) => ({ value: task.id, label: task.title, sublabel: task.week })));
        // A remembered column whose task is no longer offered (deleted, or a
        // mentor's own task from before columns were admin-only) would count
        // as selected yet be impossible to untick, so it is dropped.
        // Only once the whole list is in hand, or a task past the page would be
        // dropped too.
        if (res.pagination.total > res.data.length) return;
        const offered = new Set(res.data.map((task) => task.id));
        setSelectedTaskIds((current) => {
          const kept = current.filter((id) => offered.has(id));
          if (kept.length === current.length) return current;
          saveColumns('taskColumns', cohortId, kept);
          return kept;
        });
      })
      .catch(() => setTaskOptions([]));
  }, [cohortId]);

  // Any filter change goes back to page 1, or a narrower result could leave
  // the table on a page that no longer exists.
  const changeFilter = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const handleTaskColumnsChange = (taskIds: string[]) => {
    if (taskIds.length > MAX_TASK_COLUMNS) {
      showError(`At most ${MAX_TASK_COLUMNS} task columns at once; the first ${MAX_TASK_COLUMNS} are shown.`);
    }
    const capped = taskIds.slice(0, MAX_TASK_COLUMNS);
    setSelectedTaskIds(capped);
    saveColumns('taskColumns', cohortId, capped);
  };

  const handleRatingColumnsChange = (ratingKeys: string[]) => {
    setSelectedRatingKeys(ratingKeys);
    saveColumns('ratingColumns', cohortId, ratingKeys);
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
      const report = await apiExportStudentReport(cohortId, filters);
      const csvColumns = [
        { key: 'project', header: 'Project' },
        { key: 'projectDescription', header: 'Project description' },
        { key: 'team', header: 'Team' },
        { key: 'student', header: 'Student' },
        { key: 'email', header: 'Email' },
        { key: 'batch', header: 'Batch' },
        { key: 'track', header: 'Track' },
        { key: 'mentor', header: 'Mentor' },
        { key: 'attendance', header: 'Attendance %' },
        ...report.taskColumns.map((task) => ({ key: `task:${task.id}`, header: task.title })),
        ...report.ratingColumns.map((column) => ({ key: `rating:${column.key}`, header: column.label })),
        ...(report.ratingColumns.length > 0 ? [{ key: 'ratedOn', header: 'Rated on' }] : []),
        ...report.evaluationColumns.map((column) => ({ key: `eval:${column.configId}`, header: column.label })),
        { key: 'feedback', header: 'Latest feedback' },
        { key: 'feedbackDate', header: 'Feedback date' },
        { key: 'feedbackBy', header: 'Feedback by' },
      ];
      // CSV has no merged cells, so the project repeats on every teammate's row.
      const csvRows = report.rows.map((row) => {
        const csvRow: Record<string, string | number> = {
          project: row.projectTitle ?? '',
          projectDescription: row.projectDescription ?? '',
          team: row.teamName ?? '',
          student: row.fullName,
          email: row.email,
          batch: row.batch ?? '',
          track: row.trackName ?? '',
          mentor: row.mentorName ?? '',
          attendance: row.attendance.percentage === null ? '' : Math.round(row.attendance.percentage),
          feedback: row.feedback?.note ?? '',
          feedbackDate: row.feedback ? formatInIST(row.feedback.assessedAt) : '',
          feedbackBy: row.feedback?.mentorName ?? '',
        };
        for (const task of report.taskColumns) csvRow[`task:${task.id}`] = taskCellExportValue(row.tasks[task.id]);
        for (const column of report.ratingColumns) {
          csvRow[`rating:${column.key}`] = row.ratings?.values[column.key] ?? '';
        }
        csvRow.ratedOn = row.ratings ? formatInIST(row.ratings.assessedAt) : '';
        for (const column of report.evaluationColumns) csvRow[`eval:${column.configId}`] = formatMarks(row, column);
        return csvRow;
      });
      exportToCSV(`student_reports_${cohortId}`, csvRows, csvColumns);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to export student reports');
    } finally {
      setExporting(false);
    }
  };

  const mentorOptions = useMemo(
    () => mentors.map((m) => ({ value: m.id, label: m.fullName ?? m.email ?? m.id })),
    [mentors]
  );

  const rowSpans = useMemo(() => projectRowSpans(rows), [rows]);
  const spanProject = (_row: StudentReportRow, index: number) => rowSpans[index] ?? 1;

  const columns = [
    {
      key: 'projectTitle',
      header: 'Project',
      rowSpan: spanProject,
      render: (row: StudentReportRow) => (
        <div className="min-w-[160px] max-w-[220px] leading-tight">
          <div className="text-white font-medium">{row.projectTitle ?? <span className="text-gray-500">No project</span>}</div>
          {row.teamName && <div className="text-[11px] text-gray-500 mt-0.5">{row.teamName}</div>}
        </div>
      ),
    },
    {
      key: 'projectDescription',
      header: 'Project description',
      rowSpan: spanProject,
      render: (row: StudentReportRow) =>
        row.projectDescription ? (
          <div className="flex items-start gap-2 min-w-[220px] max-w-[320px]">
            <p className="flex-1 text-xs text-gray-400 line-clamp-4">{row.projectDescription}</p>
            <button
              type="button"
              onClick={() =>
                setViewingProject({ title: row.projectTitle ?? 'Project', description: row.projectDescription ?? '' })
              }
              title="View full description"
              aria-label="View full project description"
              className="shrink-0 p-1 rounded-md text-gray-400 hover:text-gold hover:bg-zinc-750 transition-colors"
            >
              <Eye size={14} />
            </button>
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'fullName',
      header: 'Student',
      render: (row: StudentReportRow) => (
        <div className="leading-tight">
          <div className="text-white font-medium whitespace-nowrap">{row.fullName}</div>
          <div className="text-[11px] text-gray-500">{row.email}</div>
        </div>
      ),
    },
    { key: 'batch', header: 'Batch', render: (row: StudentReportRow) => <span className="whitespace-nowrap">{row.batch ?? '—'}</span> },
    { key: 'trackName', header: 'Track', render: (row: StudentReportRow) => row.trackName ?? '—' },
    {
      key: 'mentorName',
      header: 'Mentor',
      render: (row: StudentReportRow) => <span className="whitespace-nowrap">{row.mentorName ?? '—'}</span>,
    },
    {
      key: 'attendance',
      header: 'Attendance',
      render: (row: StudentReportRow) => (
        <span
          className={`text-sm font-semibold tabular-nums ${
            row.attendance.percentage === null ? 'text-gray-500' : percentageTone(row.attendance.percentage)
          }`}
          title={`${row.attendance.present} present of ${row.attendance.totalSessions} sessions`}
        >
          {formatPercentage(row.attendance.percentage)}
        </span>
      ),
    },
    ...taskColumns.map((task) => ({
      key: `task:${task.id}`,
      header: task.title,
      render: (row: StudentReportRow) => <TaskCell cell={row.tasks[task.id]} />,
    })),
    ...ratingColumns.map((column) => ({
      key: `rating:${column.key}`,
      header: column.label,
      render: (row: StudentReportRow) => {
        const value = row.ratings?.values[column.key] ?? null;
        return (
          <span
            className={`text-sm font-semibold tabular-nums ${value === null ? 'text-gray-500' : ratingTone(value)}`}
            title={row.ratings ? `Latest assessment, ${formatInIST(row.ratings.assessedAt)}` : 'Not assessed yet'}
          >
            {formatRating(value)}
          </span>
        );
      },
    })),
    ...(ratingColumns.length > 0
      ? [
          {
            key: 'ratedOn',
            header: 'Rated on',
            render: (row: StudentReportRow) => (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {row.ratings ? formatInIST(row.ratings.assessedAt) : '—'}
              </span>
            ),
          },
        ]
      : []),
    ...evaluationColumns.map((column) => ({
      key: `eval:${column.configId}`,
      header: column.label,
      render: (row: StudentReportRow) => {
        const value = formatMarks(row, column);
        const tone = value === 'Absent' ? 'text-red-400' : value === '—' || value === 'Not scored' ? 'text-gray-500' : 'text-white';
        return <span className={`whitespace-nowrap tabular-nums ${tone}`}>{value}</span>;
      },
    })),
    {
      key: 'feedback',
      header: 'Latest feedback',
      render: (row: StudentReportRow) =>
        row.feedback ? (
          <div className="min-w-[220px] max-w-[320px] leading-tight">
            <p className="text-xs text-gray-300 line-clamp-3" title={row.feedback.note}>
              {row.feedback.note}
            </p>
            <div className="text-[11px] text-gray-500 mt-1">
              {formatInIST(row.feedback.assessedAt)}
              {row.feedback.mentorName ? ` · ${row.feedback.mentorName}` : ''}
            </div>
          </div>
        ) : (
          <span className="text-gray-500">—</span>
        ),
    },
  ];

  return (
    <PageLayout className="space-y-3">
      <p className="text-xs text-gray-500">
        One row per student, grouped by team. Add task columns to see each student's submission: its link, or Pending
        before the deadline and Not submitted after it. Rating columns show the latest assessment (1–5). Attendance counts
        unmarked sessions as absent.
      </p>
      <DataTable<StudentReportRow>
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Search student, email, team or project..."
        onSearchChange={handleSearchChange}
        // The table's own export only writes the page it holds. This one
        // fetches every matching team first, with file links signed.
        hideExport
        leftHeaderContent={
          <>
            <Select
              isMulti
              isSearchable
              variant="filter"
              value={selectedTaskIds}
              onChange={handleTaskColumnsChange}
              options={taskOptions}
              placeholder="+ Task columns"
              className="min-w-[170px] !text-xs !py-1.5"
              menuMinWidth={320}
            />
            <Select
              isMulti
              isSearchable
              variant="filter"
              value={selectedRatingKeys}
              onChange={handleRatingColumnsChange}
              options={ratingOptions.map((option) => ({ value: option.key, label: option.label }))}
              placeholder="+ Rating columns"
              className="min-w-[170px] !text-xs !py-1.5"
              menuMinWidth={300}
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
              isMulti
              isSearchable
              variant="filter"
              value={selectedMentorIds}
              onChange={changeFilter(setSelectedMentorIds)}
              options={mentorOptions}
              placeholder="All Mentors"
              className="min-w-[170px] !text-xs !py-1.5"
            />
            <span className="text-xs text-gray-500 shrink-0">
              {pagination.total} team{pagination.total === 1 ? '' : 's'}
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
      <Modal open={!!viewingProject} onClose={() => setViewingProject(null)} title={viewingProject?.title ?? ''} size="lg">
        {/* pre-wrap keeps the paragraphs the description was written with. */}
        <p className="text-sm text-gray-300 whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto pr-1">
          {viewingProject?.description}
        </p>
      </Modal>
    </PageLayout>
  );
}
