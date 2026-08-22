// The projects teams wrote for themselves, for one OJT.
//
// Used by an admin across a whole cohort and by a mentor across their own
// teams — the difference is decided entirely server-side, so this component
// never narrows anything itself and there is no client-side scoping to get
// wrong. The same is true of the track filter, the search and the paging:
// each one is a query parameter, never a slice of an over-fetched list.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Pencil, Eye, Users, AlertCircle } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import Select from '../../../components/Select';
import { useToast } from '../../../toast';
import {
  apiListSelfProposedProjects,
  apiGetSelfProposedCounts,
  type SelfProposedProject,
  type SelfProposedCounts,
} from '../../../lib/api/selfProposedProjects';
import SelfProposedProjectModal from './SelfProposedProjectModal';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

interface Props {
  cohortId: string;
  /** Track slugs to offer in the filter, from the cohort's own track list. */
  trackOptions: { value: string; label: string }[];
}

export default function SelfProposedProjectsPanel({ cohortId, trackOptions }: Props) {
  const { showError } = useToast();
  const [rows, setRows] = useState<SelfProposedProject[]>([]);
  const [counts, setCounts] = useState<SelfProposedCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [track, setTrack] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  // Which project the modal is showing, and whether it opened to read or to
  // edit. Held as an id rather than the row so a save can refresh from the
  // server without the modal keeping a stale copy.
  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [openMode, setOpenMode] = useState<'view' | 'edit'>('view');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListSelfProposedProjects({
        cohortId,
        track: track || undefined,
        search: search || undefined,
        page,
        limit,
      });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load proposed projects');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [cohortId, track, search, page, limit, showError]);

  useEffect(() => {
    load();
  }, [load]);

  // Counts describe the whole OJT, not the filtered page, so they only need
  // refetching when the cohort changes or an edit lands — not on every filter.
  const loadCounts = useCallback(async () => {
    try {
      setCounts(await apiGetSelfProposedCounts(cohortId));
    } catch {
      setCounts(null);
    }
  }, [cohortId]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleTrackChange = (value: string) => {
    setPage(1);
    setTrack(value);
  };

  const openProject = (row: SelfProposedProject, mode: 'view' | 'edit') => {
    setOpenProjectId(row.id);
    setOpenMode(mode);
  };

  const columns = useMemo(() => buildColumns(), []);

  return (
    <div className="space-y-4">
      <CountCards counts={counts} />

      <DataTable<SelfProposedProject>
        columns={columns}
        data={rows}
        loading={loading}
        searchPlaceholder="Search by project title or team..."
        onSearchChange={handleSearchChange}
        exportFilename="self-proposed-projects"
        leftHeaderContent={
          <Select
            variant="filter"
            className="min-w-[180px]"
            value={track}
            onChange={handleTrackChange}
            placeholder="All Tracks"
            options={trackOptions}
          />
        }
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          totalPages: pagination.totalPages,
          onPageChange: setPage,
          onLimitChange: (next) => {
            setPage(1);
            setLimit(next);
          },
        }}
        actions={(row) => (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openProject(row, 'view');
              }}
              title="View full project"
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 transition-colors"
            >
              <Eye size={15} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                openProject(row, 'edit');
              }}
              title="Edit project"
              className="p-1.5 rounded-md text-gray-400 hover:text-gold hover:bg-zinc-750 transition-colors"
            >
              <Pencil size={15} />
            </button>
          </div>
        )}
        onRowClick={(row) => openProject(row, 'view')}
      />

      {openProjectId && (
        <SelfProposedProjectModal
          projectId={openProjectId}
          initialMode={openMode}
          onClose={() => setOpenProjectId(null)}
          onSaved={() => {
            load();
            loadCounts();
          }}
        />
      )}
    </div>
  );
}

/**
 * How many proposals this OJT has per track, and how many are out of reach.
 *
 * The blocked cards name the cause rather than lumping them into "not
 * approved", because each is a different person's move to make: a mentor who
 * hasn't reviewed yet, a student who owes a resubmission, or a team that
 * disbanded and left its proposal behind. A cause with a count of zero is
 * hidden — an empty state is noise, not information.
 */
function CountCards({ counts }: { counts: SelfProposedCounts | null }) {
  if (!counts) return null;

  const blocked = [
    { label: 'Awaiting mentor review', value: counts.notEditable.pendingReview },
    { label: 'Resubmission pending', value: counts.notEditable.rejected },
    { label: 'Team disbanded', value: counts.notEditable.noTeam },
    { label: 'Never submitted', value: counts.notEditable.neverSubmitted },
  ].filter((b) => b.value > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="px-4 py-3 rounded-lg bg-zinc-900 border border-gold/30 min-w-[140px]">
          <p className="text-[11px] uppercase tracking-wider text-gold font-bold">Editable</p>
          <p className="text-2xl font-bold text-white tabular-nums">{counts.editableTotal}</p>
        </div>
        {counts.byTrack.map((t) => (
          <div key={t.slug} className="px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-800 min-w-[140px]">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{t.name}</p>
            <p className="text-2xl font-bold text-white tabular-nums">{t.count}</p>
          </div>
        ))}
      </div>

      {blocked.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 rounded-lg bg-zinc-900/60 border border-zinc-800">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500 font-bold">
            <AlertCircle size={13} />
            Not editable
          </span>
          {blocked.map((b) => (
            <span key={b.label} className="text-xs text-gray-400">
              {b.label}: <span className="text-white font-semibold tabular-nums">{b.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The table's own columns.
 *
 * Team and students come first because that is what an admin scans for, and
 * the wide free-text columns follow. DataTable scrolls horizontally on its
 * own, so the long ones can stay — but every free-text cell is clamped to two
 * lines, because a table row is only as short as its tallest cell and one
 * project's full write-up was enough to bury every other column. The whole
 * text belongs in the modal, which onRowClick opens.
 */
function buildColumns() {
  return [
    {
      key: 'team',
      header: 'Team',
      render: (row: SelfProposedProject) => (
        <span className="font-semibold text-white whitespace-nowrap">{row.team.name ?? '—'}</span>
      ),
    },
    {
      key: 'members',
      header: 'Students',
      render: (row: SelfProposedProject) => (
        <span className="flex items-center gap-1.5 text-gray-300 whitespace-nowrap">
          <Users size={13} className="text-gray-500 shrink-0" />
          {row.team.members.length > 0
            ? row.team.members.map((m) => m.fullName ?? '—').join(', ')
            : '—'}
        </span>
      ),
    },
    {
      key: 'projectId',
      header: 'ID',
      render: (row: SelfProposedProject) => (
        <span className="font-mono text-xs text-gray-500 whitespace-nowrap">{row.projectId ?? '—'}</span>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      render: (row: SelfProposedProject) => (
        <span className="text-white">{row.title}</span>
      ),
    },
    {
      key: 'trackName',
      header: 'Track',
      render: (row: SelfProposedProject) => (
        <span className="text-gray-300 whitespace-nowrap">{row.trackName}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      // Two lines, then cut. NOT `inline-block`: line-clamp works by setting
      // `display: -webkit-box`, so any display utility alongside it wins and
      // the clamp silently does nothing — which is how a single long write-up
      // grew a table row to several hundred pixels and pushed every other
      // column's content out of view. The full text is one click away in the
      // view modal (onRowClick), and on hover as a title.
      render: (row: SelfProposedProject) => (
        <p className="text-gray-400 line-clamp-2 min-w-[240px] max-w-[420px]" title={row.description || undefined}>
          {row.description || '\u2014'}
        </p>
      ),
    },
    {
      key: 'industry',
      header: 'Industry',
      render: (row: SelfProposedProject) => (
        <span className="text-gray-400 whitespace-nowrap">{row.industry || '—'}</span>
      ),
    },
    {
      key: 'techStack',
      header: 'Tech Stack',
      // Same clamp as Description, and for the same reason — a long stack list
      // is the other cell that can run a row tall.
      render: (row: SelfProposedProject) => (
        <p className="text-gray-400 line-clamp-2 max-w-[280px]" title={row.techStack.join(', ') || undefined}>
          {row.techStack.join(', ') || '\u2014'}
        </p>
      ),
    },
    {
      key: 'estimatedDuration',
      header: 'Weeks',
      render: (row: SelfProposedProject) => (
        <span className="text-gray-400 tabular-nums">{row.estimatedDuration ?? '—'}</span>
      ),
    },
    {
      key: 'lastEdit',
      header: 'Last edited',
      render: (row: SelfProposedProject) =>
        row.lastEdit ? (
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {new Date(row.lastEdit.at).toLocaleDateString()} · {row.lastEdit.by}
          </span>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        ),
    },
  ];
}
