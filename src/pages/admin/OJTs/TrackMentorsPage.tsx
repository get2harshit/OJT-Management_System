import PageLayout from '../../../components/PageLayout';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Users, Save, Sparkles, ClipboardPaste } from 'lucide-react';
import CohortPageHeader from './CohortPageHeader';
import DataTable from '../../../components/DataTable';
import Select from '../../../components/Select';
import type { ApiCandidateMentor } from '../../../lib/api/tracks';
import {
  apiGetCohort,
  apiGetTrackCandidateMentors,
  apiGetTrackMentors,
  apiSetTrackMentors,
  apiResolveMentorNames,
} from '../../../lib/api';
import { getCohortLabel } from '../../../lib/cohortLabel';
import { useTracks } from '../../../hooks/useTracks';
import { useToast } from '../../../toast';
import { usePageRefresh } from '../../../context/RefreshContext';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

const TYPE_OPTIONS = [
  { value: '', label: 'All mentors' },
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
];

type MentorRow = ApiCandidateMentor & Record<string, unknown> & { id: string };

// Staffing screen for one track, reached from the people icon on its row in
// Track Configuration.
//
// This *replaces* the track's mentor set rather than adding to it, which is
// what makes removing someone possible — the old in-modal picker could only
// ever grow the list. That means the selection has to be seeded with whoever
// already staffs the track and carried across every page and filter, because
// the save sends the complete set: anything missing from it is treated as a
// removal. Hence loading the current mentors up front, separately from the
// paged roster, instead of inferring the set from whatever page is on screen.
export default function TrackMentorsPage() {
  const { cohortId, trackSlug } = useParams<{ cohortId: string; trackSlug: string }>();
  // Which configuration of the track is being staffed. A track can be
  // configured several times per OJT and each has its own roster, so the slug
  // in the path doesn't identify one. Absent for a track with a single
  // configuration, which the server resolves on its own.
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
  const [rows, setRows] = useState<MentorRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // What the track had when the screen opened — the save button stays disabled
  // until the selection actually differs from it, so an accidental visit can't
  // rewrite the roster with what it already was.
  const [initialSelected, setInitialSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pastedNames, setPastedNames] = useState('');
  const [resolving, setResolving] = useState(false);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadCohort = useCallback(() => {
    if (!cohortId) return Promise.resolve();
    return apiGetCohort(cohortId)
      .then((c) => setCohortLabel(getCohortLabel(c)))
      .catch(() => {});
  }, [cohortId]);

  const loadAssigned = useCallback(async () => {
    if (!cohortId || !trackSlug) return;
    try {
      const assigned = await apiGetTrackMentors(cohortId, trackSlug, configId);
      const ids = new Set(assigned.map((m) => m.mentorId));
      setSelected(ids);
      setInitialSelected(ids);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load this track&apos;s mentors');
    }
  }, [cohortId, trackSlug, configId, showError]);

  const fetchPage = useCallback(async () => {
    if (!cohortId || !trackSlug) return;
    try {
      const res = await apiGetTrackCandidateMentors(
        cohortId,
        trackSlug,
        {
          page,
          limit,
          search: search || undefined,
          type: typeFilter === 'internal' || typeFilter === 'external' ? typeFilter : undefined,
        },
        configId
      );
      setRows(res.data.map((m) => ({ ...m, id: m.mentorId })));
      setPagination(res.pagination);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load mentors');
    }
  }, [cohortId, trackSlug, configId, page, limit, search, typeFilter, showError]);

  useEffect(() => {
    loadCohort();
  }, [loadCohort]);

  // Runs once per track — the assigned set is the save's baseline, so
  // re-reading it on every filter change would quietly discard edits in
  // progress.
  useEffect(() => {
    loadAssigned();
  }, [loadAssigned]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  usePageRefresh(useCallback(() => Promise.all([loadCohort(), loadAssigned(), fetchPage()]), [loadCohort, loadAssigned, fetchPage]));

  const handleSearch = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleTypeChange = (value: string) => {
    setPage(1);
    setTypeFilter(value);
  };

  const toggleOne = (row: MentorRow) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.mentorId)) next.delete(row.mentorId);
      else next.add(row.mentorId);
      return next;
    });
  };

  // Select-all acts on the current page only, so it reads as "everyone I can
  // see" rather than silently reaching into pages the admin hasn't looked at.
  const pageIds = rows.map((r) => r.mentorId);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const isDirty =
    selected.size !== initialSelected.size || Array.from(selected).some((id) => !initialSelected.has(id));

  const addedCount = Array.from(selected).filter((id) => !initialSelected.has(id)).length;
  const removedCount = Array.from(initialSelected).filter((id) => !selected.has(id)).length;

  // Paste the catalog's recommended_mentor cell and tick whoever it names,
  // rather than hunting each one across three pages of a 50-mentor roster.
  //
  // Adds to the selection instead of replacing it: an admin may have ticked
  // people already, and pasting a second list must not undo the first. Nothing
  // is written here — Save still sends the whole set, so a paste stays a
  // reviewable change.
  const handleResolveNames = async () => {
    if (!cohortId || !pastedNames.trim()) return;
    setResolving(true);
    try {
      const { matched, unmatched } = await apiResolveMentorNames(cohortId, pastedNames);

      const added = matched.filter((m) => !selected.has(m.mentorId)).length;
      setSelected((prev) => {
        const next = new Set(prev);
        matched.forEach((m) => next.add(m.mentorId));
        return next;
      });

      if (matched.length > 0) {
        // Distinguishes matched from newly added — pasting the same list twice
        // otherwise reads as having done nothing.
        showSuccess(
          added === matched.length
            ? `${added} mentor${added === 1 ? '' : 's'} selected`
            : `${matched.length} matched, ${added} newly selected`
        );
        setPastedNames('');
      }

      // Said separately and never folded into the count above: selecting some
      // of a pasted list and staying quiet about the rest looks exactly like
      // having selected all of it.
      const notFound = unmatched.filter((u) => u.reason === 'not_found').map((u) => u.name);
      const ambiguous = unmatched.filter((u) => u.reason === 'ambiguous').map((u) => u.name);
      if (notFound.length) {
        showError(`Not on this OJT: ${notFound.join(', ')}`);
      }
      if (ambiguous.length) {
        showError(`More than one mentor is named ${ambiguous.join(', ')} — pick from the list below.`);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to match those names');
    } finally {
      setResolving(false);
    }
  };

  const handleSave = async () => {
    if (!cohortId || !trackSlug || !isDirty) return;
    setSaving(true);
    try {
      const saved = await apiSetTrackMentors(cohortId, trackSlug, Array.from(selected), configId);
      const ids = new Set(saved.map((m) => m.mentorId));
      setSelected(ids);
      setInitialSelected(ids);
      showSuccess(`${ids.size} mentor${ids.size === 1 ? '' : 's'} now staffing ${trackName}`);
      await fetchPage();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save mentors');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout className="space-y-4">
      <CohortPageHeader
        title={`${trackName} — Mentors`}
        subtitle={cohortLabel ? `${cohortLabel} · who students on this track can pick` : undefined}
        icon={Users}
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-400">
          {isDirty ? (
            <>
              {addedCount > 0 && <span className="text-emerald-400">+{addedCount} to add</span>}
              {addedCount > 0 && removedCount > 0 && <span className="text-gray-600"> · </span>}
              {removedCount > 0 && <span className="text-red-400">−{removedCount} to remove</span>}
              <span className="text-gray-500"> — unsaved</span>
            </>
          ) : (
            `${selected.size} mentor${selected.size === 1 ? '' : 's'} staffing this track`
          )}
        </p>
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover hover:scale-105 transition-all duration-200 text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>

      <div className="bg-zinc-850 border border-zinc-750 rounded-xl px-4 py-3 space-y-2">
        <label className="block text-sm text-gray-400">
          Paste mentor names <span className="text-gray-600">— comma separated</span>
        </label>
        <div className="flex gap-2 flex-wrap">
          <textarea
            value={pastedNames}
            onChange={(e) => setPastedNames(e.target.value)}
            placeholder="Chennaveer Jogur, Soumen Mukherjee, Navneet Nautiyal"
            rows={2}
            className="flex-1 min-w-[260px] px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm resize-y focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
          />
          <button
            onClick={handleResolveNames}
            disabled={!pastedNames.trim() || resolving}
            className="self-start flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 text-gray-300 font-medium rounded-lg hover:border-gold hover:text-white transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ClipboardPaste size={15} />
            {resolving ? 'Matching...' : 'Select these'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Ticks whoever is named, across every page — casing and extra spaces don't matter. Anything
          that doesn't match is reported rather than skipped. Nothing is saved until you press Save
          changes.
        </p>
      </div>

      {selected.size === 0 && (
        <div className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3">
          No mentors on this track. Students who pick it will find nobody to choose at project submission.
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
                title="Select all on this page"
                className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold cursor-pointer"
              />
            ),
            render: (row) => (
              <input
                type="checkbox"
                readOnly
                checked={selected.has(row.mentorId)}
                className="rounded bg-zinc-750 border-zinc-650 accent-gold pointer-events-none"
              />
            ),
          },
          {
            key: 'fullName',
            header: 'Name',
            render: (row) => (
              <span className="flex items-center gap-2">
                <span className="text-white">{row.fullName || '—'}</span>
                {/* Their declared expertise covers this track — a hint for who
                    to pick, never a restriction on who can be picked. */}
                {row.hasExpertise && (
                  <span title="Declared expertise in this track" className="text-gold">
                    <Sparkles size={13} />
                  </span>
                )}
              </span>
            ),
          },
          {
            key: 'email',
            header: 'Email',
            render: (row) => <span className="text-xs text-gray-400 truncate block max-w-[240px]">{row.email || '—'}</span>,
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
        ]}
        data={rows}
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
        searchPlaceholder="Search name or email..."
        hideExport
        leftHeaderContent={
          <Select value={typeFilter} onChange={(v) => handleTypeChange(v as string)} options={TYPE_OPTIONS} className="w-40" />
        }
      />
    </PageLayout>
  );
}
