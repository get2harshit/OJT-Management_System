import { useCallback, useEffect, useRef, useState } from 'react';
import { Edit2, Percent } from 'lucide-react';
import DataTable from '../../components/DataTable';
import Modal from '../../components/Modal';
import SpinnerSquare from '../../components/SpinnerSquare';
import Select from '../../components/Select';
import ActionsMenu from '../../components/ActionsMenu';
import type { ApiMentor, Cohort, MentorCapacitySummary } from '../../lib/types';
import { TRACKS, TRACK_DOT_COLORS, MENTOR_TYPE_DOT_COLORS } from '../../lib/constants';
import { apiListMentorsPage, apiUpdateMentor, apiListCohorts, apiGetMentorCapacity, apiSetMentorCapacityOverride } from '../../lib/api';
import { mapBackendTrackToFrontend, mapFrontendTrackToBackend } from '../../lib/api/trackMapping';
import { getCohortLabel } from '../../lib/cohortLabel';
import { useToast } from '../../toast';

interface MentorRow extends ApiMentor {
  assignedTracks: string[];
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

export default function AdminMentors() {
  const { showSuccess, showError } = useToast();
  const [mentors, setMentors] = useState<MentorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [editingMentor, setEditingMentor] = useState<MentorRow | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Set Capacity
  const [capacityMentor, setCapacityMentor] = useState<MentorRow | null>(null);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [capacityCohortId, setCapacityCohortId] = useState('');
  const [capacitySummary, setCapacitySummary] = useState<MentorCapacitySummary | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityInput, setCapacityInput] = useState('');
  const [capacitySaving, setCapacitySaving] = useState(false);

  const fetchMentors = useCallback(async () => {
    try {
      const res = await apiListMentorsPage({ page, limit, search: search || undefined });
      setMentors(res.data.map(m => ({
        ...m,
        assignedTracks: (m.tracks ?? []).map(mapBackendTrackToFrontend),
      })));
      setPagination(res.pagination);
    } catch {
      setMentors([]);
    }
  }, [page, limit, search]);

  useEffect(() => {
    setTableLoading(true);
    fetchMentors().finally(() => {
      setTableLoading(false);
      setLoading(false);
    });
  }, [fetchMentors]);

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handleSearchChange = (value: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(value);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleLimitChange = (value: number) => {
    setPage(1);
    setLimit(value);
  };

  const handleOpenEdit = (mentor: MentorRow) => {
    setEditingMentor(mentor);
    setSelectedTracks([...mentor.assignedTracks]);
  };

  const handleSaveTracks = async () => {
    if (!editingMentor) return;
    setSaving(true);
    try {
      await apiUpdateMentor(editingMentor.id, {
        track: selectedTracks.map(mapFrontendTrackToBackend),
      });
      setMentors(prev =>
        prev.map(m => m.id === editingMentor.id ? { ...m, assignedTracks: selectedTracks } : m)
      );
      showSuccess('Tracks assigned successfully');
      setEditingMentor(null);
      setSelectedTracks([]);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to assign tracks');
    } finally {
      setSaving(false);
    }
  };

  const toggleTrack = (track: string) => {
    setSelectedTracks(prev =>
      prev.includes(track) ? prev.filter(t => t !== track) : [...prev, track]
    );
  };

  const loadCapacitySummary = async (mentorId: string, cohortId: string) => {
    setCapacityLoading(true);
    try {
      const res = await apiGetMentorCapacity(mentorId, cohortId);
      setCapacitySummary(res);
      setCapacityInput(res.override !== null ? String(res.override) : '');
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to load capacity for this cohort');
      setCapacitySummary(null);
    } finally {
      setCapacityLoading(false);
    }
  };

  const handleOpenCapacity = async (mentor: MentorRow) => {
    setCapacityMentor(mentor);
    setCapacitySummary(null);
    setCapacityInput('');
    let cohortList = cohorts;
    if (cohortList.length === 0) {
      try {
        cohortList = await apiListCohorts();
        setCohorts(cohortList);
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Failed to load cohorts');
        return;
      }
    }
    if (cohortList.length > 0) {
      const cohortId = cohortList[0].id;
      setCapacityCohortId(cohortId);
      loadCapacitySummary(mentor.id, cohortId);
    }
  };

  const handleCapacityCohortChange = (cohortId: string) => {
    setCapacityCohortId(cohortId);
    if (capacityMentor) loadCapacitySummary(capacityMentor.id, cohortId);
  };

  const handleSaveCapacity = async () => {
    if (!capacityMentor) return;
    const trimmed = capacityInput.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      showError('Capacity must be a non-negative number');
      return;
    }
    setCapacitySaving(true);
    try {
      await apiSetMentorCapacityOverride(capacityMentor.id, value);
      showSuccess(value === null ? 'Capacity override cleared — using computed baseline again' : 'Capacity override saved');
      await loadCapacitySummary(capacityMentor.id, capacityCohortId);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to save capacity');
    } finally {
      setCapacitySaving(false);
    }
  };

  const tableData = mentors.map(m => ({
    id: m.id,
    name: m.fullName || '—',
    email: m.email || '—',
    type: m.isExternal ? 'External' : 'Internal',
    assignedTracks: m.assignedTracks,
    _raw: m,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">Mentors</h1>
      </div>

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={48} />
        </div>
      ) : (
        <div className="relative">
          {tableLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center">
              <SpinnerSquare size={56} />
            </div>
          )}
          <div className={tableLoading ? 'opacity-20 transition-opacity' : 'transition-opacity'}>
          <DataTable
          columns={[
            { key: 'name', header: 'Name' },
            { key: 'email', header: 'Email' },
            {
              key: 'type',
              header: 'Type',
              render: (row) => {
                const style = MENTOR_TYPE_DOT_COLORS[row.type] ?? MENTOR_TYPE_DOT_COLORS.Internal;
                return (
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                    {row.type}
                  </span>
                );
              },
            },
            {
              key: 'assignedTracks',
              header: 'Specialized Tracks',
              render: (row) => (
                <div className="flex flex-wrap gap-x-3 gap-y-1 max-w-xs">
                  {row.assignedTracks && row.assignedTracks.length > 0
                    ? row.assignedTracks.map((t) => {
                      const style = TRACK_DOT_COLORS[t] ?? { dot: 'bg-gray-400', text: 'text-gray-300' };
                      return (
                        <span key={t} className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {t}
                        </span>
                      );
                    })
                    : <span className="text-gray-500 text-xs">Not assigned</span>
                  }
                </div>
              ),
            },
          ]}
          data={tableData}
          searchPlaceholder="Search mentors..."
          onSearchChange={handleSearchChange}
          serverPagination={{
            page: pagination.page,
            limit: pagination.limit,
            total: pagination.total,
            totalPages: pagination.totalPages,
            onPageChange: setPage,
            limitOptions: [20, 40, 80, 100],
            onLimitChange: handleLimitChange,
          }}
          actions={(row) => (
            <ActionsMenu
              items={[
                { label: 'Edit Tracks', icon: Edit2, onClick: () => handleOpenEdit(row._raw) },
                { label: 'Set Capacity', icon: Percent, onClick: () => handleOpenCapacity(row._raw) },
              ]}
            />
          )}
          />
          </div>
        </div>
      )}

      {/* Assign Tracks Modal */}
      <Modal
        open={!!editingMentor}
        onClose={() => { setEditingMentor(null); setSelectedTracks([]); }}
        title="Assign Tracks to Mentor"
      >
        <div className="space-y-4">
          {/* Mentor info — read-only */}
          <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3 space-y-1">
            <p className="text-white text-sm font-semibold">{editingMentor?.fullName || '—'}</p>
            <p className="text-gray-400 text-xs">{editingMentor?.email || '—'}</p>
          </div>

          {/* Track selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Specialized Tracks <span className="text-gray-600">(Select one or more)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-zinc-800/50 p-3 rounded-lg border border-zinc-700">
              {TRACKS.map(t => {
                const checked = selectedTracks.includes(t);
                return (
                  <label key={t} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer hover:text-white">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTrack(t)}
                      className="rounded bg-zinc-750 border-zinc-650 accent-gold focus:ring-gold"
                    />
                    {t}
                  </label>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleSaveTracks}
            disabled={selectedTracks.length === 0 || saving}
            className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Track Assignment'}
          </button>
        </div>
      </Modal>

      {/* Set Capacity Modal */}
      <Modal
        open={!!capacityMentor}
        onClose={() => {
          setCapacityMentor(null);
          setCapacitySummary(null);
          setCapacityInput('');
          setCapacityCohortId('');
        }}
        title="Set Mentor Capacity"
      >
        <div className="space-y-4">
          <div className="bg-zinc-800/60 border border-zinc-700 rounded-lg px-4 py-3 space-y-1">
            <p className="text-white text-sm font-semibold">{capacityMentor?.fullName || '—'}</p>
            <p className="text-gray-400 text-xs">{capacityMentor?.email || '—'}</p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Cohort</label>
            <Select
              value={capacityCohortId}
              onChange={handleCapacityCohortChange}
              options={cohorts.map((c) => ({ value: c.id, label: getCohortLabel(c) }))}
              placeholder="Select a cohort"
            />
          </div>

          {capacityLoading ? (
            <div className="min-h-[15vh] flex items-center justify-center">
              <SpinnerSquare size={32} />
            </div>
          ) : capacitySummary ? (
            <>
              <div className="bg-zinc-800/50 p-3 rounded-lg border border-zinc-700 text-xs text-gray-400">
                Computed baseline for this cohort: <span className="text-white font-semibold">{capacitySummary.computedBaseline}</span> projects
                {capacitySummary.override !== null && (
                  <span> — currently overridden to <span className="text-gold font-semibold">{capacitySummary.override}</span></span>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Capacity override <span className="text-gray-600">(leave empty to use computed baseline)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={capacityInput}
                  onChange={(e) => setCapacityInput(e.target.value)}
                  placeholder={String(capacitySummary.computedBaseline)}
                  className="w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
                />
              </div>

              <button
                onClick={handleSaveCapacity}
                disabled={capacitySaving}
                className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-50"
              >
                {capacitySaving ? 'Saving...' : 'Save Capacity'}
              </button>
            </>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
