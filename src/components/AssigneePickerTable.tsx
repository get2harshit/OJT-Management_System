import DataTable from './DataTable';
import Select from './Select';
import { getTrackColor } from '../lib/constants';

export interface AssigneePickerStudentRow {
  id: string;
  fullName: string | null;
  batch: string | null;
  track: string | null;
  rollNumber?: string | null;
}

export interface AssigneePickerTeamRow {
  id: string;
  teamName: string | null;
  track: string | null;
  memberNames: string[];
}

interface AssigneePickerTableProps {
  mode: 'individual' | 'team';
  // Omit to hide the Individual/Team dropdown entirely — a mentor-targeted
  // task has no team concept, so the caller just never renders one and this
  // stays permanently 'individual'.
  onModeChange?: (mode: 'individual' | 'team') => void;
  studentRows: AssigneePickerStudentRow[];
  teamRows: AssigneePickerTeamRow[];
  batchOptions: { value: string; label: string }[];
  batchFilter: string;
  onBatchFilterChange: (value: string) => void;
  trackNameBySlug: Map<string, string>;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  loading?: boolean;
}

function TrackChip({ slug, trackNameBySlug }: { slug: string | null; trackNameBySlug: Map<string, string> }) {
  if (!slug) return <span className="text-gray-500">—</span>;
  const { dot, text } = getTrackColor(slug);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {trackNameBySlug.get(slug) ?? slug}
    </span>
  );
}

// The checkbox-table assignee picker shared by CreateTaskPage (create) and
// the admin Tasks.tsx edit modal (add assignees). Reuses the exact pattern
// already proven in TrackEligibleStudentsPage.tsx — checkbox column via
// DataTable's headerRender/render, a Set-based selection that survives
// filtering, leftHeaderContent for the filter row — rather than the old
// flat isMulti Select, which gave no visibility into which track or batch
// each candidate belonged to once a task could span more than one track.
//
// No serverPagination: the candidate list is already fetched and filtered
// (by track/batch) by the caller before it ever reaches this component, and
// is bounded by cohort size — DataTable's own client-side search/pagination
// is enough.
export default function AssigneePickerTable({
  mode,
  onModeChange,
  studentRows,
  teamRows,
  batchOptions,
  batchFilter,
  onBatchFilterChange,
  trackNameBySlug,
  selected,
  onSelectedChange,
  loading = false,
}: AssigneePickerTableProps) {
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  const modeOptions = [
    { value: 'individual', label: 'Individual Students' },
    { value: 'team', label: 'Whole Teams' },
  ];

  const filterRow = (
    <div className="flex items-center gap-2">
      <Select value={batchFilter} onChange={(v) => onBatchFilterChange(v as string)} options={batchOptions} className="w-36" />
      {onModeChange && (
        <Select value={mode} onChange={(v) => onModeChange(v as 'individual' | 'team')} options={modeOptions} className="w-44" />
      )}
    </div>
  );

  if (mode === 'team') {
    const selectableIds = teamRows.map((r) => r.id);
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
    const toggleAll = () => {
      const next = new Set(selected);
      if (allSelected) selectableIds.forEach((id) => next.delete(id));
      else selectableIds.forEach((id) => next.add(id));
      onSelectedChange(next);
    };

    return (
      <DataTable<AssigneePickerTeamRow>
        columns={[
          {
            key: 'select',
            header: '',
            headerRender: () => (
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                title="Select all"
                className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold cursor-pointer"
              />
            ),
            render: (row) => (
              <input
                type="checkbox"
                readOnly
                checked={selected.has(row.id)}
                className="rounded bg-zinc-750 border-zinc-650 accent-gold pointer-events-none"
              />
            ),
          },
          { key: 'teamName', header: 'Team', render: (row) => <span className="text-white font-medium">{row.teamName || 'Team'}</span> },
          {
            key: 'memberNames',
            header: 'Members',
            render: (row) => <span className="text-xs text-gray-300">{row.memberNames.join(', ') || '—'}</span>,
          },
          { key: 'track', header: 'Track', render: (row) => <TrackChip slug={row.track} trackNameBySlug={trackNameBySlug} /> },
        ]}
        data={teamRows}
        onRowClick={(row) => toggleOne(row.id)}
        searchPlaceholder="Search teams..."
        searchKeys={['teamName']}
        hideExport
        loading={loading}
        leftHeaderContent={filterRow}
      />
    );
  }

  const selectableIds = studentRows.map((r) => r.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) selectableIds.forEach((id) => next.delete(id));
    else selectableIds.forEach((id) => next.add(id));
    onSelectedChange(next);
  };

  return (
    <DataTable<AssigneePickerStudentRow>
      columns={[
        {
          key: 'select',
          header: '',
          headerRender: () => (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              title="Select all"
              className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold cursor-pointer"
            />
          ),
          render: (row) => (
            <input
              type="checkbox"
              readOnly
              checked={selected.has(row.id)}
              className="rounded bg-zinc-750 border-zinc-650 accent-gold pointer-events-none"
            />
          ),
        },
        { key: 'fullName', header: 'Name', render: (row) => <span className="text-white">{row.fullName || '—'}</span> },
        { key: 'track', header: 'Track', render: (row) => <TrackChip slug={row.track} trackNameBySlug={trackNameBySlug} /> },
        { key: 'batch', header: 'Batch', render: (row) => <span className="text-gray-300">{row.batch || '—'}</span> },
        { key: 'rollNumber', header: 'Reg No', render: (row) => <span className="font-mono text-xs text-gray-300">{row.rollNumber || '—'}</span> },
      ]}
      data={studentRows}
      onRowClick={(row) => toggleOne(row.id)}
      searchPlaceholder="Search students..."
      searchKeys={['fullName', 'rollNumber']}
      hideExport
      loading={loading}
      leftHeaderContent={filterRow}
    />
  );
}

// Dedupes a merged multi-track student fetch by id, and derives the
// candidate's Track chip from whichever slug the caller filtered them in
// under (a student fetched under two tracks in one merge is deduped to the
// first one seen — display only, doesn't affect what gets assigned).
export function dedupeStudentRows(rows: AssigneePickerStudentRow[]): AssigneePickerStudentRow[] {
  return Array.from(new Map(rows.map((r) => [r.id, r])).values());
}
