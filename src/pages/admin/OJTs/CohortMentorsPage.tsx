import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Check, AlertTriangle, Eye } from 'lucide-react';
import DataTable from '../../../components/DataTable';
import Select from '../../../components/Select';
import SpinnerSquare from '../../../components/SpinnerSquare';
import Modal from '../../../components/Modal';
import MentorRoster from './MentorRoster';
import { EMPTY_PROJECTS_MAP } from './StudentDetailCard';
import type { ApiMentor, ApiStudent, TeamAllocationDetail } from '../../../lib/types';
import { apiListMentorsPage, apiListMentorIds, apiGetCohort, apiAddMentorsToCohort, apiGetMentorById } from '../../../lib/api';
import { apiGetTeamsForCohortDetailed, apiGetMentorLoadSummary } from '../../../lib/api/allocations';
import type { MentorLoadSummaryRow } from '../../../lib/types';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const TYPE_OPTIONS = [
  { value: '', label: 'All mentors' },
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
];

type MentorRow = ApiMentor & Record<string, unknown>;

// Adds mentors to an OJT. Until this runs, the OJT has no mentors at all:
// creating a cohort auto-enrols students from its allowed batches but nothing
// enrols mentors, and every downstream mentor picker — track staffing most
// visibly — reads from the cohort's membership. An empty roster here is why
// those pickers come up blank.
//
// Additive only, because the backend has no unmap endpoint. That is surfaced
// rather than hidden: mentors already on the OJT are shown ticked and locked,
// so the screen can't imply a removal it cannot perform. The previous version
// let one be unticked and then quietly dropped that from the save.
//
// The roster is paged and searched server-side. It used to load every mentor
// and filter in the browser, which is the wrong shape for a list that grows
// with every external mentor an OJT takes on.
export default function CohortMentorsPage() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [rows, setRows] = useState<MentorRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Already on the OJT — read once, and never editable here.
  const [alreadyMapped, setAlreadyMapped] = useState<Set<string>>(new Set());
  // Ticked during this visit. Kept separate from alreadyMapped so the save
  // knows exactly what is new without diffing two lists.
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  // Detail view — opened via the row's "view details" icon, kept separate
  // from the checkbox toggle so browsing a mentor's roster never disturbs
  // the in-progress cohort-mapping selection underneath it.
  const [detailMentorId, setDetailMentorId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMentor, setDetailMentor] = useState<ApiMentor | null>(null);
  const [detailTeams, setDetailTeams] = useState<TeamAllocationDetail[]>([]);
  // Cohort-wide, fetched once and looked up per mentor rather than re-fetched
  // on every open — allocatedCount/threshold are the same "how loaded is
  // everyone" numbers the admin allocation panel already computes.
  const [loadByMentor, setLoadByMentor] = useState<Map<string, MentorLoadSummaryRow>>(new Map());

  useEffect(() => {
    if (!cohortId) return;
    apiGetMentorLoadSummary(cohortId)
      .then((rows) => setLoadByMentor(new Map(rows.map((r) => [r.mentorId, r]))))
      .catch(() => setLoadByMentor(new Map()));
  }, [cohortId]);

  const openDetail = useCallback(async (mentorId: string) => {
    setDetailMentorId(mentorId);
    if (!cohortId) return;
    setDetailLoading(true);
    try {
      const [mentor, teamsRes] = await Promise.all([
        apiGetMentorById(mentorId),
        apiGetTeamsForCohortDetailed(cohortId, { mentorId, limit: 50 }),
      ]);
      setDetailMentor(mentor);
      setDetailTeams(teamsRes.data);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to load mentor detail');
      setDetailMentor(null);
    } finally {
      setDetailLoading(false);
    }
  }, [cohortId, showError]);

  const closeDetail = () => {
    setDetailMentorId(null);
    setDetailMentor(null);
    setDetailTeams([]);
  };

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadCohort = useCallback(async () => {
    if (!cohortId) return;
    try {
      const details = await apiGetCohort(cohortId, true);
      setAlreadyMapped(new Set(details.mentors.map((m) => m.id)));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load this OJT');
      navigate(-1);
    }
  }, [cohortId, navigate, showError]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiListMentorsPage({
        page,
        limit,
        search: search || undefined,
        // Counts teams for this OJT without scoping the list to it — the roster
        // shown here has to include mentors not on the OJT yet, because adding
        // them is what this screen does.
        teamCountsCohortId: cohortId,
        type: typeFilter === 'internal' || typeFilter === 'external' ? typeFilter : undefined,
      });
      setRows(res.data as MentorRow[]);
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load mentors');
    } finally {
      setLoading(false);
    }
  }, [cohortId, page, limit, search, typeFilter, showError]);

  // Runs once — the mapped set is the save's baseline, so re-reading it on
  // every filter change would discard ticks made in the meantime.
  useEffect(() => {
    loadCohort();
  }, [loadCohort]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  usePageRefresh(useCallback(async () => {
    await Promise.all([loadCohort(), fetchPage()]);
  }, [loadCohort, fetchPage]));

  const handleSearch = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const toggleOne = (row: MentorRow) => {
    if (alreadyMapped.has(row.id)) return;
    setToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  };

  // The header checkbox acts on the current page, which is what a checkbox in a
  // table header means everywhere else. Taking the whole roster is a separate,
  // explicitly-labelled action below. Already-mapped rows are skipped by both —
  // they are not this control's to change.
  const selectableOnPage = rows.filter((r) => !alreadyMapped.has(r.id)).map((r) => r.id);
  const allPageSelected = selectableOnPage.length > 0 && selectableOnPage.every((id) => toAdd.has(id));

  const toggleAllOnPage = () => {
    setToAdd((prev) => {
      const next = new Set(prev);
      if (allPageSelected) selectableOnPage.forEach((id) => next.delete(id));
      else selectableOnPage.forEach((id) => next.add(id));
      return next;
    });
  };

  // Everyone the current search and type filter match — the same filter the
  // table is running on, so what gets ticked is exactly what is on screen
  // across every page.
  //
  // Ids only. Asking the paged endpoint for the whole roster would ship every
  // column of every mentor so the client could read one uuid off each row.
  const selectAllMatching = async () => {
    if (pagination.total === 0) return;
    setSelectingAll(true);
    try {
      const ids = await apiListMentorIds({
        search: search || undefined,
        type: typeFilter === 'internal' || typeFilter === 'external' ? typeFilter : undefined,
      });
      const selectable = ids.filter((id) => !alreadyMapped.has(id));
      setToAdd((prev) => {
        const next = new Set(prev);
        selectable.forEach((id) => next.add(id));
        return next;
      });
      showSuccess(`${selectable.length} mentor${selectable.length === 1 ? '' : 's'} selected`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to select every mentor');
    } finally {
      setSelectingAll(false);
    }
  };

  const handleSave = async () => {
    if (!cohortId || toAdd.size === 0) return;
    setSaving(true);
    try {
      const added = Array.from(toAdd);
      await apiAddMentorsToCohort(cohortId, added);
      showSuccess(`${added.length} mentor${added.length === 1 ? '' : 's'} added to this OJT`);
      navigate(-1);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add mentors to this OJT');
      // Only cleared on failure. On success the overlay stays up through the
      // navigation instead of flashing this screen back on its way out.
      setSaving(false);
    }
  };

  return (
    <PageLayout className="space-y-4">
      {/* Status, warning and actions on one row, so the table gets the height. */}
      <div className="flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <p className="text-sm text-gray-400">
            {toAdd.size > 0 ? (
              <>
                <span className="text-emerald-400">+{toAdd.size} to add</span>
                <span className="text-gray-500"> — unsaved</span>
              </>
            ) : (
              `${alreadyMapped.size} mentor${alreadyMapped.size === 1 ? '' : 's'} on this OJT`
            )}
          </p>
          {alreadyMapped.size === 0 && !loading && (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle size={13} className="shrink-0" />
              No mentors yet — track staffing will have nobody to choose from.
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 text-gray-300 font-medium rounded-lg hover:border-zinc-600 hover:text-white transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={toAdd.size === 0 || saving}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <Save size={16} />
            {saving ? 'Adding...' : 'Add to OJT'}
          </button>
        </div>
      </div>

      {saving && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <SpinnerSquare size={72} />
          <p className="text-sm text-gray-300">Adding mentors…</p>
        </div>
      )}

      {/* Shown once the page is fully ticked and there is more than a page —
          exactly when the header checkbox stops meaning what it looks like. */}
      {allPageSelected && pagination.total > rows.length && (
        <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
          <span>All {selectableOnPage.length} selectable on this page ticked.</span>
          <button
            onClick={selectAllMatching}
            disabled={selectingAll}
            className="text-gold hover:underline font-medium disabled:opacity-50 disabled:no-underline"
          >
            {selectingAll ? 'Selecting…' : `Select all ${pagination.total} matching`}
          </button>
        </div>
      )}

      <DataTable<MentorRow>
        columns={[
          {
            key: 'select',
            header: '',
            headerRender: () => (
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={toggleAllOnPage}
                disabled={selectableOnPage.length === 0}
                title="Select every mentor on this page who isn't already on the OJT"
                className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold cursor-pointer disabled:opacity-30"
              />
            ),
            render: (row) =>
              alreadyMapped.has(row.id) ? (
                // Locked rather than pre-ticked: there is no unmap endpoint, so
                // an editable checkbox here would offer a removal that silently
                // never happens.
                <span title="Already on this OJT" className="text-emerald-400 flex">
                  <Check size={15} />
                </span>
              ) : (
                <input
                  type="checkbox"
                  readOnly
                  checked={toAdd.has(row.id)}
                  className="rounded bg-zinc-750 border-zinc-650 accent-gold pointer-events-none"
                />
              ),
          },
          {
            key: 'fullName',
            header: 'Name',
            render: (row) => (
              <span className={alreadyMapped.has(row.id) ? 'text-gray-400' : 'text-white'}>
                {row.fullName || row.email || '—'}
              </span>
            ),
          },
          {
            key: 'email',
            header: 'Email',
            render: (row) => (
              <span className="text-xs text-gray-400 truncate block max-w-[240px]">{row.email || '—'}</span>
            ),
          },
          {
            key: 'organization',
            header: 'Organization',
            render: (row) => <span className="text-gray-300">{row.organization || '—'}</span>,
          },
          {
            key: 'isExternal',
            header: 'Type',
            render: (row) => (
              <span className={`text-xs font-medium ${row.isExternal ? 'text-sky-400' : 'text-gray-400'}`}>
                {row.isExternal ? 'External' : 'Internal'}
              </span>
            ),
          },
          {
            // How loaded this mentor already is on this OJT — the number that
            // decides whether adding them is useful, shown where the decision
            // is made instead of on the Allocations screen it used to live on.
            //
            // A mentor with none reads as a dash rather than 0: on this page
            // most rows are people not on the OJT at all, and a column of
            // zeroes would say "nobody mentors anything here" when it means
            // "nothing has been allocated to them yet".
            key: 'teamsReporting',
            header: 'Teams',
            render: (row) =>
              row.teamsReporting ? (
                <span className="text-gray-200 tabular-nums" title={`${row.teamsReporting} team${row.teamsReporting === 1 ? '' : 's'} report to this mentor in this OJT`}>
                  {row.teamsReporting}
                </span>
              ) : (
                <span className="text-gray-600">—</span>
              ),
          },
        ]}
        data={rows}
        loading={loading}
        serverPagination={{
          page: pagination.page,
          limit: pagination.limit,
          total: pagination.total,
          totalPages: pagination.totalPages,
          onPageChange: setPage,
          onLimitChange: (l) => {
            setLimit(l);
            setPage(1);
          },
        }}
        onSearchChange={handleSearch}
        onRowClick={toggleOne}
        searchPlaceholder="Search name, email or organization..."
        hideExport
        leftHeaderContent={
          <Select
            value={typeFilter}
            onChange={(v) => {
              setPage(1);
              setTypeFilter(v as string);
            }}
            options={TYPE_OPTIONS}
            className="w-40"
          />
        }
        actions={(row) => (
          <button
            type="button"
            title="View mentor details"
            onClick={(e) => {
              e.stopPropagation();
              openDetail(row.id);
            }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-zinc-750 transition-colors"
          >
            <Eye size={14} />
          </button>
        )}
      />

      <Modal open={!!detailMentorId} onClose={closeDetail} title="Mentor Details" size="xl">
        {detailLoading ? (
          <div className="flex items-center justify-center py-16">
            <SpinnerSquare size={40} />
          </div>
        ) : !detailMentor ? (
          <p className="p-4 text-gray-500 text-xs">Mentor not found.</p>
        ) : (
          <MentorRoster
            mentor={detailMentor}
            teams={detailTeams}
            studentsById={new Map(
              detailTeams.flatMap(t => t.members).map(m => [
                m.studentId,
                { id: m.studentId, fullName: m.fullName, batch: m.batch ?? undefined, email: m.email ?? undefined } as ApiStudent,
              ])
            )}
            projectsById={EMPTY_PROJECTS_MAP}
            onBack={closeDetail}
            load={loadByMentor.get(detailMentor.id)}
          />
        )}
      </Modal>
    </PageLayout>
  );
}
