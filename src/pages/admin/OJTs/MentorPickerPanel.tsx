import { useState } from 'react';
import { X, Search, CheckSquare, Square } from 'lucide-react';
import type { ApiMentor } from '../../../lib/types';

// Right-side drawer for filling one external-mentor slot in the Mentor
// Pairings grid — a searchable, filterable list instead of a cramped
// dropdown, since the candidate pool is every mentor in the cohort (can run
// into the dozens). Picking a mentor fills the slot and closes the drawer —
// one slot, one pick, not a multi-select basket.
export function MentorPickerPanel({
  open,
  onClose,
  mentors,
  trackNameBySlug,
  internalMentorName,
  internalMentorTrackNames,
  internalMentorTeamCount,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  mentors: ApiMentor[];
  trackNameBySlug: Map<string, string>;
  // Whose slot this drawer is filling — shown up top so it's never
  // ambiguous which row's "Add" was clicked.
  internalMentorName?: string;
  internalMentorTrackNames?: string[];
  internalMentorTeamCount?: number;
  onSelect: (mentorId: string) => void;
}) {
  const [search, setSearch] = useState('');
  // Both on by default (= every mentor, same as before this split existed).
  // Two independent checkboxes instead of one "industry only" toggle, so
  // either pool can be hidden — panelists can come from either group.
  const [showInternal, setShowInternal] = useState(true);
  const [showExternal, setShowExternal] = useState(true);

  if (!open) return null;

  const filtered = mentors.filter((m) => {
    if (m.isExternal ? !showExternal : !showInternal) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (m.fullName || '').toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q) ||
      (m.organization || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-sm h-full bg-zinc-900 border-l border-zinc-750 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-white truncate">
              Panel mentor of {internalMentorName || '—'}
            </h4>
            {internalMentorTrackNames && internalMentorTrackNames.length > 0 && (
              <p className="flex flex-wrap items-center gap-1 mt-1">
                {internalMentorTrackNames.map((name) => (
                  <span
                    key={name}
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gold/10 text-gold border border-gold/30 truncate max-w-[160px]"
                  >
                    {name}
                  </span>
                ))}
                {internalMentorTeamCount !== undefined && (
                  <span className="text-[11px] text-gray-500">
                    · {internalMentorTeamCount} team{internalMentorTeamCount === 1 ? '' : 's'}
                  </span>
                )}
              </p>
            )}
            <p className="text-[11px] text-gray-500 mt-1">Pick a mentor for this slot</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-zinc-800 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 border-b border-zinc-800 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mentor by name, email, organization..."
              autoFocus
              className="w-full pl-8 pr-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowInternal((v) => !v)}
              className="flex items-center gap-2 text-xs text-gray-300 hover:text-white"
            >
              {showInternal ? <CheckSquare size={15} className="text-gold" /> : <Square size={15} className="text-gray-500" />}
              Internal
            </button>
            <button
              onClick={() => setShowExternal((v) => !v)}
              className="flex items-center gap-2 text-xs text-gray-300 hover:text-white"
            >
              {showExternal ? <CheckSquare size={15} className="text-gold" /> : <Square size={15} className="text-gray-500" />}
              Industry / external
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && <p className="text-xs text-gray-500 text-center py-8">No mentors match.</p>}
          {filtered.map((m) => {
            const trackNames = (m.tracks ?? []).map((slug) => trackNameBySlug.get(slug) ?? slug);
            const detail = [trackNames.join(', ') || null, m.organization || null].filter(Boolean).join(' · ');
            return (
              <button
                key={m.id}
                onClick={() => {
                  onSelect(m.id);
                  onClose();
                }}
                className="w-full text-left px-4 py-3 hover:bg-zinc-800 border-b border-zinc-850 flex items-center justify-between gap-2 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{m.fullName || m.email}</p>
                  {detail && <p className="text-[11px] text-gray-500 truncate mt-0.5">{detail}</p>}
                </div>
                {m.isExternal && (
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-blue-400 border border-blue-400/30 rounded px-1.5 py-0.5">
                    Industry
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
