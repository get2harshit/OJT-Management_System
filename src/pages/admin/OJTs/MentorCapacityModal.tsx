import { useCallback, useEffect, useRef, useState } from 'react';
import { Save } from 'lucide-react';
import Modal from '../../../components/Modal';
import Select from '../../../components/Select';
import SpinnerSquare from '../../../components/SpinnerSquare';
import { MENTOR_TYPE_DOT_COLORS } from '../../../lib/constants';
import { apiListMentorCapacities, apiBulkSetMentorCapacity } from '../../../lib/api';
import type { MentorCapacityListRow } from '../../../lib/types';
import { useToast } from '../../../toast';

const SEARCH_DEBOUNCE_MS = 400;

// No 'all' entry here — Select's own placeholder already renders as the
// clear-selection row bound to '', which is exactly what an "All types"
// option would otherwise duplicate.
const TYPE_OPTIONS = [
  { value: 'internal', label: 'Internal' },
  { value: 'external', label: 'External' },
];

interface MentorCapacityModalProps {
  open: boolean;
  onClose: () => void;
}

export default function MentorCapacityModal({ open, onClose }: MentorCapacityModalProps) {
  const { showSuccess, showError } = useToast();

  const [rows, setRows] = useState<MentorCapacityListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | 'internal' | 'external'>('');
  // mentorId -> pending capacity, only for rows actually edited away from
  // what was loaded — this doubles as the "anything to save?" check, so it's
  // trimmed back down (not just overwritten) the moment an edit is undone.
  const [edits, setEdits] = useState<Map<string, number | null>>(new Map());

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [searchInput, setSearchInput] = useState('');

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiListMentorCapacities({ search: search || undefined, type: type || undefined });
      setRows(data);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load mentors');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, type, showError]);

  useEffect(() => {
    if (open) fetchRows();
  }, [open, fetchRows]);

  const handleClose = () => {
    setRows([]);
    setEdits(new Map());
    setSearch('');
    setSearchInput('');
    setType('');
    onClose();
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearch(value), SEARCH_DEBOUNCE_MS);
  };

  const handleCapacityChange = (row: MentorCapacityListRow, raw: string) => {
    const value = raw.trim() === '' ? null : Number(raw);
    setEdits((prev) => {
      const next = new Map(prev);
      if (value === row.capacityOverride) {
        next.delete(row.mentorId);
      } else {
        next.set(row.mentorId, value);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (edits.size === 0) return;
    const updates = Array.from(edits.entries()).map(([mentorId, capacityOverride]) => ({ mentorId, capacityOverride }));
    const invalid = updates.find((u) => u.capacityOverride !== null && (!Number.isFinite(u.capacityOverride) || u.capacityOverride < 0));
    if (invalid) {
      showError('Capacity must be a non-negative number');
      return;
    }
    setSaving(true);
    try {
      await apiBulkSetMentorCapacity(updates);
      showSuccess(`Capacity saved for ${updates.length} mentor${updates.length === 1 ? '' : 's'}`);
      setEdits(new Map());
      await fetchRows();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save capacity changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Mentor Capacity" size="xl">
      <div className="space-y-4">
        <p className="text-xs text-gray-400">
          One flat number per mentor — how many teams they'll take, across every OJT. 0 removes them from the
          student's picker. Leave a field empty to use the default of 1.
        </p>

        <div className="flex gap-3">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name or email..."
            className="flex-1 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
          />
          <div className="w-44 shrink-0">
            <Select
              value={type}
              onChange={(v) => setType(v as '' | 'internal' | 'external')}
              options={TYPE_OPTIONS}
              placeholder="All types"
            />
          </div>
        </div>

        {loading ? (
          <div className="min-h-[30vh] flex items-center justify-center">
            <SpinnerSquare size={36} />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-gray-400 text-sm py-8 text-center">No mentors match this filter.</p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {rows.map((row) => {
              const typeLabel = row.isExternal ? 'External' : 'Internal';
              const style = MENTOR_TYPE_DOT_COLORS[typeLabel] ?? MENTOR_TYPE_DOT_COLORS.Internal;
              const pendingValue = edits.get(row.mentorId);
              const displayValue = edits.has(row.mentorId) ? pendingValue : row.capacityOverride;
              return (
                <div
                  key={row.mentorId}
                  className="flex items-center justify-between gap-3 bg-zinc-800/50 border border-zinc-750 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{row.fullName || '—'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${style.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        {typeLabel}
                      </span>
                      <span className="text-gray-500 text-xs truncate">{row.email || row.organization || ''}</span>
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={displayValue ?? ''}
                    onChange={(e) => handleCapacityChange(row, e.target.value)}
                    placeholder={`Default (${row.effectiveCapacity})`}
                    className="w-28 shrink-0 bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-1.5 text-white text-sm text-right focus:outline-none focus:border-gold"
                  />
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={edits.size === 0 || saving}
          className="w-full py-2.5 bg-gold text-black font-semibold rounded-lg hover:bg-gold-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Save size={16} />
          {saving ? 'Saving...' : edits.size > 0 ? `Save Changes (${edits.size})` : 'Save Changes'}
        </button>
      </div>
    </Modal>
  );
}
