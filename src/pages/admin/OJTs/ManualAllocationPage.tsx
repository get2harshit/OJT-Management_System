import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Eye, Plus, Search, Trash2, UserPlus, X } from 'lucide-react';
import PageLayout from '../../../components/PageLayout';
import CohortPageHeader from './CohortPageHeader';
import Drawer from '../../../components/Drawer';
import Select from '../../../components/Select';
import ProjectDetail from '../../../components/ProjectDetail';
import SpinnerSquare from '../../../components/SpinnerSquare';
import {
  apiCreateManualTeams,
  apiGetCohort,
  apiGetManualAllocationMentors,
  apiGetManualAllocationYears,
  apiGetOpsProjects,
  apiGetPlaceableStudents,
  apiGetProject,
  apiGetSelectableTracks,
  apiGetTeammateCandidates,
} from '../../../lib/api';
import type {
  ManualAllocationMentor,
  OpsProject,
  PlaceableStudent,
  SelectableTrack,
} from '../../../lib/api';
import type { Project } from '../../../lib/types';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useToast } from '../../../toast';
import { useConfirm } from '../../../confirm';

const PAGE_SIZE = 25;
const DRAWER_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

/**
 * Building teams for the students who never built one themselves.
 *
 * A table of unplaced students, one row each, and four cells to fill beside
 * them — teammate, track, project, mentor. Each cell opens a drawer listing
 * only what the selection so far allows, and every one of those lists comes
 * from the server: which tracks a pair may take, which mentors staff the
 * variant they resolve to, and who is even free to be a teammate are all
 * decided by rules that live behind the API. The page asks; it does not decide.
 *
 * Rows accumulate into a draft and are submitted together, because that is how
 * the work actually happens — an admin works down a batch, not one team at a
 * time. Nothing is written until Create, and the draft survives a reload
 * (localStorage) so a half-finished batch is not lost to a stray refresh.
 *
 * The submit is deliberately not a publish. It creates teams, locked in as
 * allocated; making any of it visible to students is still the Allocations
 * page's Publish, unchanged.
 */

/** One drafted team, keyed by the student whose row it started on. */
interface DraftRow {
  rowId: string;
  studentId: string;
  studentName: string;
  teammate: { id: string; name: string } | null;
  track: { slug: string; id: string; name: string } | null;
  project: { id: string; title: string; code: string | null } | null;
  mentor: { id: string; name: string } | null;
  /** Why the last submit refused this row. Cleared when anything on it changes. */
  error?: string;
}

type CellKind = 'teammate' | 'track' | 'project' | 'mentor';

const draftStorageKey = (cohortId: string) => `ojt-manual-allocation-draft:${cohortId}`;

/**
 * The saved draft for this OJT, or an empty one.
 *
 * Read during the first render rather than in an effect. An effect that
 * restores races the effect that saves: the saving one fires on mount too, with
 * the empty state React started from, and overwrites the stored draft before
 * the restore lands — which under StrictMode's double-invoked effects is not a
 * near miss but the reliable outcome. Reading it here means there is never a
 * moment where the state is empty and the storage is not.
 */
function readDraft(cohortId: string | undefined): Record<string, DraftRow> {
  if (!cohortId) return {};
  try {
    const stored = localStorage.getItem(draftStorageKey(cohortId));
    return stored ? JSON.parse(stored) : {};
  } catch {
    // A draft that won't parse is one from an older shape of this page.
    // Starting empty is the only safe reading of it.
    localStorage.removeItem(draftStorageKey(cohortId));
    return {};
  }
}

/** Is this row ready to be sent? Every cell but the teammate is required. */
const isComplete = (row: DraftRow) => !!row.track && !!row.project && !!row.mentor;

const studentIdsOf = (row: DraftRow) => (row.teammate ? [row.studentId, row.teammate.id] : [row.studentId]);

export default function ManualAllocationPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const { showSuccess, showError } = useToast();
  const confirm = useConfirm();

  const [cohortName, setCohortName] = useState('');
  const [years, setYears] = useState<string[]>([]);
  const [year, setYear] = useState('');

  const [students, setStudents] = useState<PlaceableStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [draft, setDraft] = useState<Record<string, DraftRow>>(() => readDraft(cohortId));
  // Keyed by the student whose row it is, not by the draft row's id: opening a
  // cell can be the thing that creates the row, and the id of a row created in
  // the same event isn't readable until the next render.
  const [openCell, setOpenCell] = useState<{ studentId: string; kind: CellKind } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── draft persistence ─────────────────────────────────────────────────────
  // Saved on every change. A batch of twenty rows is twenty drawer journeys;
  // losing it to a stray refresh would be losing an hour. The initial read is
  // in useState above — see readDraft for why it cannot be an effect.
  //
  // Re-read when the OJT changes: React Router keeps this component mounted
  // when only the :cohortId param moves, so the initializer would not run
  // again and the previous OJT's draft would appear under this one.
  useEffect(() => { setDraft(readDraft(cohortId)); }, [cohortId]);

  useEffect(() => {
    if (!cohortId) return;
    localStorage.setItem(draftStorageKey(cohortId), JSON.stringify(draft));
  }, [cohortId, draft]);

  useEffect(() => {
    if (!cohortId) return;
    apiGetCohort(cohortId)
      .then((cohort) => setCohortName(getCohortLabel(cohort)))
      .catch(() => setCohortName(''));
    apiGetManualAllocationYears(cohortId)
      .then(setYears)
      .catch((error) => showError(error.message));
  }, [cohortId, showError]);

  // Nothing is listed until a year is chosen: the years run different rules
  // (2024 is individual-only), and a mixed list would invite pairing across
  // them, which no track accepts.
  const loadStudents = useCallback(() => {
    if (!cohortId || !year) {
      setStudents([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    apiGetPlaceableStudents(cohortId, { year, search, page, limit: PAGE_SIZE })
      .then((res) => {
        setStudents(res.data);
        setTotal(res.pagination.total);
      })
      .catch((error) => showError(error.message))
      .finally(() => setLoading(false));
  }, [cohortId, year, search, page, showError]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  // ── draft edits ───────────────────────────────────────────────────────────

  const updateRow = useCallback((studentId: string, studentName: string, change: Partial<DraftRow>) => {
    setDraft((current) => {
      const existing = current[studentId] ?? {
        rowId: `${studentId}:${Date.now()}`,
        studentId,
        studentName,
        teammate: null,
        track: null,
        project: null,
        mentor: null,
      };
      // A stale reason on a row the admin has since edited is worse than none:
      // it describes a row that no longer exists.
      return { ...current, [studentId]: { ...existing, ...change, error: undefined } };
    });
  }, []);

  const clearRow = useCallback((studentId: string) => {
    setDraft((current) => {
      const next = { ...current };
      delete next[studentId];
      return next;
    });
  }, []);

  // Every student the draft has spoken for, in either seat. Used to keep one
  // person from being drafted onto two teams — the server refuses that outright
  // (both rows fail, since which one was meant is exactly what is unknown), so
  // the honest thing is to not offer it in the first place.
  const claimedStudentIds = useMemo(() => {
    const claimed = new Set<string>();
    for (const row of Object.values(draft)) {
      claimed.add(row.studentId);
      if (row.teammate) claimed.add(row.teammate.id);
    }
    return claimed;
  }, [draft]);

  // A student picked as someone's teammate stops being a row of their own —
  // they already have a place in this batch. Hidden here rather than re-fetched
  // because the server has no idea about an unsaved draft; the row count above
  // still reports what the server matched, which is the honest number.
  const teammateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of Object.values(draft)) if (row.teammate) ids.add(row.teammate.id);
    return ids;
  }, [draft]);

  const visibleStudents = useMemo(
    () => students.filter((student) => !teammateIds.has(student.id)),
    [students, teammateIds]
  );

  const readyRows = useMemo(() => Object.values(draft).filter(isComplete), [draft]);
  const draftedCount = Object.keys(draft).length;

  const handleClearAll = async () => {
    if (draftedCount === 0) return;
    const ok = await confirm({
      title: 'Clear the whole draft?',
      message: `${draftedCount} drafted row${draftedCount === 1 ? '' : 's'} will be discarded. Nothing has been created yet, so nothing on the OJT changes.`,
      confirmLabel: 'Clear all',
      variant: 'danger',
    });
    if (ok) setDraft({});
  };

  const handleCreate = async () => {
    if (!cohortId || readyRows.length === 0) return;
    setSubmitting(true);
    try {
      const result = await apiCreateManualTeams(
        cohortId,
        readyRows.map((row) => ({
          rowId: row.rowId,
          studentIds: studentIdsOf(row),
          track: row.track!.slug,
          projectId: row.project!.id,
          mentorId: row.mentor!.id,
        }))
      );

      // Only the rows that landed leave the draft. The rest keep their place
      // with the reason attached, so an admin fixes two rows rather than
      // rebuilding twenty.
      setDraft((current) => {
        const next = { ...current };
        for (const created of result.created) {
          const row = Object.values(next).find((entry) => entry.rowId === created.rowId);
          if (row) delete next[row.studentId];
        }
        for (const failure of result.failed) {
          const row = Object.values(next).find((entry) => entry.rowId === failure.rowId);
          if (row) next[row.studentId] = { ...row, error: failure.reason };
        }
        return next;
      });

      if (result.created.length > 0) {
        showSuccess(`Created ${result.created.length} team${result.created.length === 1 ? '' : 's'}.`);
      }
      if (result.failed.length > 0) {
        showError(`${result.failed.length} row${result.failed.length === 1 ? '' : 's'} could not be created — see the reasons on the rows.`);
      }
      loadStudents();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const openRow = openCell ? draft[openCell.studentId] ?? null : null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageLayout>
      <CohortPageHeader
        title="Manual allocation"
        subtitle={cohortName}
        icon={UserPlus}
        trailing={
          <span className="text-xs text-gray-500">
            Builds teams that are locked in as allocated. Publishing them to students is still done from Allocations.
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <div className="w-44">
          <Select
            variant="filter"
            options={years.map((value) => ({ value, label: `Admission ${value}` }))}
            value={year}
            onChange={(value) => { setYear(value); setPage(1); }}
            placeholder="Select year"
          />
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            disabled={!year}
            placeholder="Search name or roll number"
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-850 border border-zinc-750 rounded-lg text-gray-300 placeholder-gray-500 focus:outline-none focus:border-gold/40 disabled:opacity-50"
          />
        </div>
        <div className="flex-1" />
        {draftedCount > 0 && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1.5 text-sm px-3 py-2 bg-zinc-750 text-white font-semibold rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <Trash2 size={14} />
            Clear all
          </button>
        )}
        <button
          onClick={handleCreate}
          disabled={submitting || readyRows.length === 0}
          title={
            readyRows.length === 0
              ? 'Fill a row’s track, project and mentor first'
              : `Creates ${readyRows.length} team${readyRows.length === 1 ? '' : 's'}`
          }
          className="flex items-center gap-1.5 text-sm px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={14} />
          {submitting ? 'Creating...' : `Create ${readyRows.length} team${readyRows.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {draftedCount > readyRows.length && (
        <p className="text-xs text-gray-500 mt-2">
          {draftedCount - readyRows.length} drafted row{draftedCount - readyRows.length === 1 ? '' : 's'} still
          {' '}incomplete — a row needs a track, a project and a mentor before it can be created.
        </p>
      )}

      <div className="mt-4 flex-1 min-h-0 flex flex-col bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden">
        {!year ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500 py-16">
            Pick an admission year to list the students who still have no team.
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center py-16"><SpinnerSquare /></div>
        ) : visibleStudents.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500 py-16">
            {search ? 'No student matches that search.' : 'Every student in this year is already on a team.'}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-850 border-b border-zinc-750 z-10">
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-semibold">Student</th>
                  <th className="px-4 py-3 font-semibold">Teammate</th>
                  <th className="px-4 py-3 font-semibold">Track</th>
                  <th className="px-4 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">Mentor</th>
                  <th className="px-4 py-3 font-semibold w-10" />
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((student) => {
                  const row = draft[student.id] ?? null;
                  const name = student.fullName ?? student.rollNumber ?? student.id;
                  return (
                    <tr key={student.id} className="border-b border-zinc-800 last:border-0 align-top">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{name}</p>
                        <p className="text-[11px] text-gray-500">
                          {student.rollNumber ?? '—'}{student.batch ? ` · ${student.batch}` : ''}
                        </p>
                        {row?.error && <p className="text-[11px] text-red-400 mt-1 max-w-xs">{row.error}</p>}
                      </td>

                      <td className="px-4 py-3">
                        {student.isIndividualMandated ? (
                          // Not an empty cell with nothing to click: this
                          // student cannot be given a teammate at all, and
                          // saying so is the whole answer.
                          <span className="text-xs text-gray-500 italic">Individual only</span>
                        ) : (
                          <Cell
                            value={row?.teammate?.name ?? null}
                            onOpen={() => {
                              updateRow(student.id, name, {});
                              setOpenCell({ studentId: student.id, kind: 'teammate' });
                            }}
                            onClear={row?.teammate ? () => updateRow(student.id, name, { teammate: null, track: null, project: null, mentor: null }) : undefined}
                          />
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <Cell
                          value={row?.track?.name ?? null}
                          onOpen={() => {
                            updateRow(student.id, name, {});
                            setOpenCell({ studentId: student.id, kind: 'track' });
                          }}
                          onClear={row?.track ? () => updateRow(student.id, name, { track: null, project: null, mentor: null }) : undefined}
                        />
                      </td>

                      <td className="px-4 py-3">
                        <Cell
                          value={row?.project?.title ?? null}
                          hint={row?.project?.code ?? undefined}
                          disabled={!row?.track}
                          disabledHint="Pick a track first"
                          onOpen={() => setOpenCell({ studentId: student.id, kind: 'project' })}
                          onClear={row?.project ? () => updateRow(student.id, name, { project: null }) : undefined}
                        />
                      </td>

                      <td className="px-4 py-3">
                        <Cell
                          value={row?.mentor?.name ?? null}
                          disabled={!row?.track}
                          disabledHint="Pick a track first"
                          onOpen={() => setOpenCell({ studentId: student.id, kind: 'mentor' })}
                          onClear={row?.mentor ? () => updateRow(student.id, name, { mentor: null }) : undefined}
                        />
                      </td>

                      <td className="px-4 py-3">
                        {row && (
                          <button
                            onClick={() => clearRow(student.id)}
                            title="Discard this drafted row"
                            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {year && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-750 text-xs text-gray-400 shrink-0">
            <span>{total} student{total === 1 ? '' : 's'} without a team</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-2.5 py-1 rounded-md bg-zinc-750 disabled:opacity-40"
              >
                Previous
              </button>
              <span>Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 rounded-md bg-zinc-750 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {cohortId && openCell && openRow && (
        <CellDrawer
          cohortId={cohortId}
          kind={openCell.kind}
          row={openRow}
          draft={draft}
          claimedStudentIds={claimedStudentIds}
          onClose={() => setOpenCell(null)}
          onPick={(change) => {
            updateRow(openRow.studentId, openRow.studentName, change);
            setOpenCell(null);
          }}
        />
      )}
    </PageLayout>
  );
}

/** One fillable cell: what's in it, or an invitation to fill it. */
function Cell({
  value,
  hint,
  disabled,
  disabledHint,
  onOpen,
  onClear,
}: {
  value: string | null;
  hint?: string;
  disabled?: boolean;
  disabledHint?: string;
  onOpen: () => void;
  onClear?: () => void;
}) {
  if (value) {
    return (
      <div className="flex items-start gap-1.5 group">
        <div className="min-w-0">
          <p className="text-gray-200 truncate max-w-[180px]" title={value}>{value}</p>
          {hint && <p className="text-[11px] text-gray-500 font-mono">{hint}</p>}
        </div>
        {onClear && (
          <button
            onClick={onClear}
            title="Clear"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-gray-500 hover:text-red-400 shrink-0"
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  }
  return (
    <button
      onClick={onOpen}
      disabled={disabled}
      title={disabled ? disabledHint : undefined}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-dashed border-zinc-700 text-gray-500 hover:text-gold hover:border-gold/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-500 disabled:hover:border-zinc-700"
    >
      <Plus size={12} />
      Select
    </button>
  );
}

const DRAWER_TITLES: Record<CellKind, string> = {
  teammate: 'Choose a teammate',
  track: 'Choose a track',
  project: 'Choose a project',
  mentor: 'Choose a mentor',
};

/**
 * The right-hand picker for whichever cell was clicked.
 *
 * One component for all four because they are the same interaction — search a
 * server-narrowed list, pick one, close — and four near-identical drawers would
 * be four places to fix the next time that interaction changes.
 */
function CellDrawer({
  cohortId,
  kind,
  row,
  draft,
  claimedStudentIds,
  onClose,
  onPick,
}: {
  cohortId: string;
  kind: CellKind;
  row: DraftRow;
  draft: Record<string, DraftRow>;
  claimedStudentIds: Set<string>;
  onClose: () => void;
  onPick: (change: Partial<DraftRow>) => void;
}) {
  const { showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [teammates, setTeammates] = useState<PlaceableStudent[]>([]);
  const [tracks, setTracks] = useState<SelectableTrack[]>([]);
  const [projects, setProjects] = useState<OpsProject[]>([]);
  const [mentors, setMentors] = useState<ManualAllocationMentor[]>([]);

  // The full-screen read of one project, opened from the eye icon. Its own
  // layer over the drawer rather than a replacement for it, so closing it
  // returns to the list exactly where it was.
  const [detail, setDetail] = useState<Project | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studentIds = studentIdsOf(row);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const done = <T,>(apply: (value: T) => void) => (value: T) => { if (!cancelled) apply(value); };
    const fail = (error: Error) => { if (!cancelled) showError(error.message); };

    if (kind === 'teammate') {
      apiGetTeammateCandidates(cohortId, row.studentId, { search, page: 1, limit: DRAWER_PAGE_SIZE })
        .then(done((res) => setTeammates(res.data))).catch(fail)
        .finally(() => { if (!cancelled) setLoading(false); });
    } else if (kind === 'track') {
      apiGetSelectableTracks(cohortId, studentIds)
        .then(done(setTracks)).catch(fail)
        .finally(() => { if (!cancelled) setLoading(false); });
    } else if (kind === 'project') {
      apiGetOpsProjects(cohortId, {
        page: 1,
        limit: DRAWER_PAGE_SIZE,
        search: search || undefined,
        trackId: row.track?.id,
        // Only the imported catalog: a project a team wrote for itself belongs
        // to that team, and the create endpoint refuses one.
        source: 'catalog',
      })
        .then(done((res) => setProjects(res.data))).catch(fail)
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      apiGetManualAllocationMentors(cohortId, row.track!.slug, studentIds)
        .then(done(setMentors)).catch(fail)
        .finally(() => { if (!cancelled) setLoading(false); });
    }

    return () => { cancelled = true; };
    // studentIds is derived from row and would be a new array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId, kind, row.studentId, row.teammate?.id, row.track?.id, search, showError]);

  // How many other drafted rows already point at each project — the count an
  // admin cannot get from the server, because none of it has been written yet.
  const draftedProjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of Object.values(draft)) {
      if (entry.project && entry.rowId !== row.rowId) {
        counts.set(entry.project.id, (counts.get(entry.project.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [draft, row.rowId]);

  const openDetail = async (projectId: string) => {
    setDetailLoading(true);
    try {
      setDetail(await apiGetProject(projectId));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setDetailLoading(false);
    }
  };

  const searchable = kind === 'teammate' || kind === 'project';

  return (
    <>
      <Drawer
        open
        // The topmost layer closes first. Escape and the backdrop both land
        // here, so without this a project opened full-screen would take the
        // drawer with it and drop the admin back on the table.
        onClose={() => (detail ? setDetail(null) : onClose())}
        title={DRAWER_TITLES[kind]}
        widthClassName="max-w-lg"
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {row.studentName}
            {row.teammate ? ` + ${row.teammate.name}` : ''}
            {row.track ? ` · ${row.track.name}` : ''}
          </p>

          {searchable && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={kind === 'teammate' ? 'Search name or roll number' : 'Search title or code'}
                className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-750 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gold/40"
              />
            </div>
          )}

          {loading ? (
            <div className="py-12 flex justify-center"><SpinnerSquare /></div>
          ) : kind === 'teammate' ? (
            <PickerList
              empty="Nobody in this admission year is free to be a teammate right now."
              items={teammates.filter((candidate) => !claimedStudentIds.has(candidate.id))}
              keyOf={(candidate) => candidate.id}
              onPick={(candidate) =>
                onPick({
                  teammate: { id: candidate.id, name: candidate.fullName ?? candidate.id },
                  // The pair may not be allowed on the track chosen for one
                  // person — an individual-mode track disappears the moment a
                  // second student is added — so the rest of the row restarts.
                  track: null,
                  project: null,
                  mentor: null,
                })
              }
              render={(candidate) => (
                <>
                  <p className="text-sm text-white">{candidate.fullName ?? candidate.id}</p>
                  <p className="text-[11px] text-gray-500">
                    {candidate.rollNumber ?? '—'}{candidate.batch ? ` · ${candidate.batch}` : ''}
                  </p>
                </>
              )}
            />
          ) : kind === 'track' ? (
            <PickerList
              empty={
                row.teammate
                  ? 'No track in this OJT takes a team of two from this admission year.'
                  : 'No track in this OJT takes a single student from this admission year. Add a teammate, or configure an individual-mode track.'
              }
              items={tracks}
              keyOf={(track) => track.trackSlug}
              onPick={(track) =>
                onPick({
                  track: { slug: track.trackSlug, id: track.trackId, name: track.trackName },
                  project: null,
                  mentor: null,
                })
              }
              render={(track) => (
                <>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white">{track.trackName}</p>
                    {track.isFull && (
                      // Shown, not blocked: the ceiling is a target an admin
                      // may knowingly place past. The create still counts it.
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                        0 places left
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {track.projectMode === 'individual' ? 'Individual' : 'Team of two'}
                    {track.maxTeams !== null && ` · ${Math.max(0, track.maxTeams - track.teamCount)} of ${track.maxTeams} places left`}
                    {` · ${track.availableProjects} project${track.availableProjects === 1 ? '' : 's'} with room`}
                    {` · ${track.availableMentors} mentor${track.availableMentors === 1 ? '' : 's'} open`}
                  </p>
                </>
              )}
            />
          ) : kind === 'project' ? (
            <PickerList
              empty="No catalog project is mapped to this track in this OJT."
              items={projects}
              keyOf={(project) => project.projectId}
              onPick={(project) =>
                onPick({ project: { id: project.projectId, title: project.title, code: project.projectCode } })
              }
              render={(project) => {
                const drafted = draftedProjectCounts.get(project.projectId) ?? 0;
                return (
                  <>
                    <p className="text-sm text-white">{project.title}</p>
                    <p className="text-[11px] text-gray-500 flex flex-wrap items-center gap-x-2">
                      {project.projectCode && <span className="font-mono">{project.projectCode}</span>}
                      <span>
                        {project.teamsPickedCount} team{project.teamsPickedCount === 1 ? '' : 's'} picked it
                      </span>
                      {/* The draft's own claim on it, which the server cannot
                          know — none of it has been written yet. */}
                      {drafted > 0 && (
                        <span className="text-gold">
                          + {drafted} row{drafted === 1 ? '' : 's'} in this draft
                        </span>
                      )}
                      {project.teamsPickedCount >= 2 && (
                        <span className="text-amber-400">Selected count reached</span>
                      )}
                    </p>
                  </>
                );
              }}
              trailing={(project) => (
                <button
                  onClick={() => openDetail(project.projectId)}
                  title="Read the full project"
                  className="p-1.5 mt-1.5 text-gray-500 hover:text-gold transition-colors shrink-0"
                >
                  <Eye size={15} />
                </button>
              )}
            />
          ) : (
            <PickerList
              empty="No mentor is staffing this track configuration in this OJT."
              items={mentors}
              keyOf={(mentor) => mentor.id}
              onPick={(mentor) => onPick({ mentor: { id: mentor.id, name: mentor.fullName } })}
              render={(mentor) => (
                <>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-white">{mentor.fullName}</p>
                    {mentor.isFull && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                        At capacity
                      </span>
                    )}
                    {mentor.isExternal && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-750 text-gray-400">External</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">{mentor.organization ?? mentor.email ?? '—'}</p>
                </>
              )}
            />
          )}
        </div>
      </Drawer>

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-[60] bg-zinc-900 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-750 shrink-0">
            <h3 className="text-lg font-semibold text-white truncate">{detail?.title ?? 'Loading project'}</h3>
            <button
              onClick={() => setDetail(null)}
              aria-label="Close project"
              className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-zinc-750"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
            {detail ? <ProjectDetail project={detail} /> : <div className="py-12 flex justify-center"><SpinnerSquare /></div>}
          </div>
        </div>
      )}
    </>
  );
}

/** The shared body of all four pickers: rows you click to choose. */
function PickerList<T>({
  items,
  keyOf,
  render,
  onPick,
  empty,
  trailing,
}: {
  items: T[];
  keyOf: (item: T) => string;
  render: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
  empty: string;
  /**
   * A control beside the row rather than inside it.
   *
   * A sibling of the choose-button, not a child of it: a button inside a button
   * is invalid HTML, which React warns about and browsers resolve however they
   * like — and the one control that needs this is the project's eye, whose
   * whole job is to do something other than choose the row.
   */
  trailing?: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500 py-8 text-center">{empty}</p>;
  }
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div
          key={keyOf(item)}
          className="flex items-start gap-1 pr-1 rounded-lg bg-zinc-750/50 hover:bg-zinc-750 border border-transparent hover:border-gold/30 transition-colors"
        >
          <button onClick={() => onPick(item)} className="flex-1 min-w-0 text-left px-3 py-2.5">
            {render(item)}
          </button>
          {trailing?.(item)}
        </div>
      ))}
    </div>
  );
}
