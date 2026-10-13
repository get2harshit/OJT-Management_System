import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Maximize2, Minimize2, Search, Shuffle } from 'lucide-react';
import Select from '../../../components/Select';
import type { PanelTeam } from '../../../lib/api/evaluations';
import { isRowComplete, seatsOf, type PanelDraft } from '../../../lib/evaluationPanel';

/**
 * The secondary-panelist sheet: one primary mentor at a time, one row per
 * team, one column per secondary seat — filled the way a spreadsheet is.
 *
 *  - pick a mentor in a cell, then drag its corner handle down (or up) to copy
 *    it into the rows it passes over;
 *  - tick rows (shift-click for a range) and set a column for all of them;
 *  - or "Split evenly" a few secondaries across the rows.
 *
 * The first row is the mentor's default: it covers teams that turn up after
 * the sheet was filled in (late teams, late allocations). Every other row is
 * that team's own pairing.
 *
 * Purely a controlled view over `draft` and `defaults` — the parent owns the
 * state and decides when to save. Expanding only changes where it is drawn
 * (full screen instead of inside the modal), never what it holds.
 */

export interface PanelGridTeam extends PanelTeam {
  /** Students already scored or closed — a changed secondary does not reach them. */
  lockedCount?: number;
  assignedCount?: number;
}

interface EvaluationPanelGridProps {
  secondaryCount: number;
  /** Every mentor who may be picked as a secondary, with a display name. */
  mentors: { id: string; name: string }[];
  teams: PanelGridTeam[];
  draft: PanelDraft;
  /** primaryMentorId -> default seats, same shape as a draft row. */
  defaults: PanelDraft;
  onDraftChange: (next: PanelDraft) => void;
  onDefaultsChange: (next: PanelDraft) => void;
}

const DEFAULT_ROW = '__default__';

const teamLabel = (team: PanelTeam) => {
  const name = team.teamName ?? '—';
  return team.studentNames?.length ? `${name} (${team.studentNames.join(', ')})` : name;
};

// The shared Select is sized for forms; a sheet cell needs it denser.
const CELL_SELECT = 'w-full !px-2 !py-1 !text-xs';
const TOOLBAR_SELECT = 'min-w-[200px] !px-2 !py-1 !text-xs';

export default function EvaluationPanelGrid({
  secondaryCount,
  mentors,
  teams,
  draft,
  defaults,
  onDraftChange,
  onDefaultsChange,
}: EvaluationPanelGridProps) {
  const mentorNameById = useMemo(() => new Map(mentors.map((m) => [m.id, m.name])), [mentors]);

  // Primary mentors, in name order, with their teams.
  const teamsByPrimary = useMemo(() => {
    const map = new Map<string, PanelGridTeam[]>();
    for (const team of teams) map.set(team.primaryMentorId, [...(map.get(team.primaryMentorId) ?? []), team]);
    return map;
  }, [teams]);
  const primaryIds = useMemo(
    () =>
      [...teamsByPrimary.keys()].sort((a, b) =>
        (mentorNameById.get(a) ?? '').localeCompare(mentorNameById.get(b) ?? '')
      ),
    [teamsByPrimary, mentorNameById]
  );

  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string | null>(null);
  const [mentorSearch, setMentorSearch] = useState('');
  const activePrimaryId = selectedPrimaryId && teamsByPrimary.has(selectedPrimaryId) ? selectedPrimaryId : primaryIds[0] ?? null;
  const activeTeams = useMemo(
    () => (activePrimaryId ? teamsByPrimary.get(activePrimaryId) ?? [] : []),
    [activePrimaryId, teamsByPrimary]
  );

  // Find a team by its G-number or by any of its students. Everything that
  // acts on "the rows" — drag-fill, shift-select, split — acts on the rows
  // shown, so a filtered-out team is never changed by accident.
  const [teamSearch, setTeamSearch] = useState('');
  const visibleTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    if (!q) return activeTeams;
    return activeTeams.filter((t) => teamLabel(t).toLowerCase().includes(q));
  }, [activeTeams, teamSearch]);

  // Row keys in display order: the default row first, then the teams.
  const rowKeys = useMemo(() => [DEFAULT_ROW, ...visibleTeams.map((t) => t.teamId)], [visibleTeams]);

  const readRow = (rowKey: string) =>
    seatsOf(rowKey === DEFAULT_ROW ? defaults[activePrimaryId ?? ''] : draft[rowKey], secondaryCount);

  /** Writes many cells at once, keeping default-row and team-row edits apart. */
  const writeCells = (cells: { rowKey: string; column: number; mentorId: string }[]) => {
    if (!activePrimaryId || cells.length === 0) return;
    const nextDraft = { ...draft };
    const nextDefaults = { ...defaults };
    let draftChanged = false;
    let defaultsChanged = false;
    for (const { rowKey, column, mentorId } of cells) {
      const isDefault = rowKey === DEFAULT_ROW;
      const source = isDefault ? nextDefaults[activePrimaryId] : nextDraft[rowKey];
      const seats = seatsOf(source, secondaryCount);
      // Never the primary, never a mentor already in another seat of this row.
      if (mentorId && (mentorId === activePrimaryId || seats.some((id, i) => i !== column && id === mentorId))) continue;
      seats[column] = mentorId;
      if (isDefault) {
        nextDefaults[activePrimaryId] = seats;
        defaultsChanged = true;
      } else {
        nextDraft[rowKey] = seats;
        draftChanged = true;
      }
    }
    if (draftChanged) onDraftChange(nextDraft);
    if (defaultsChanged) onDefaultsChange(nextDefaults);
  };

  // ── Drag-to-fill ──────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<{ column: number; mentorId: string; fromIndex: number; toIndex: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;

  useEffect(() => {
    if (!drag) return;
    const finish = () => {
      const current = dragRef.current;
      setDrag(null);
      if (!current) return;
      const [low, high] = [Math.min(current.fromIndex, current.toIndex), Math.max(current.fromIndex, current.toIndex)];
      writeCells(
        rowKeys
          .slice(low, high + 1)
          .map((rowKey) => ({ rowKey, column: current.column, mentorId: current.mentorId }))
      );
    };
    window.addEventListener('mouseup', finish);
    return () => window.removeEventListener('mouseup', finish);
    // writeCells reads the latest props on each render; re-binding per drag start is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.fromIndex, drag?.column]);

  const inDragRange = (index: number, column: number) => {
    if (!drag || drag.column !== column) return false;
    return index >= Math.min(drag.fromIndex, drag.toIndex) && index <= Math.max(drag.fromIndex, drag.toIndex);
  };

  // ── Row selection (shift-click for a range) ──────────────────────────────
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const lastClickedIndex = useRef<number | null>(null);

  // A new mentor starts with a clean slate; a new search clears the
  // selection too, so a bulk set never reaches rows that are hidden.
  useEffect(() => {
    setTeamSearch('');
  }, [activePrimaryId]);
  useEffect(() => {
    setSelectedTeamIds(new Set());
    lastClickedIndex.current = null;
  }, [activePrimaryId, teamSearch]);

  const toggleRow = (teamIndex: number, shiftKey: boolean) => {
    const next = new Set(selectedTeamIds);
    if (shiftKey && lastClickedIndex.current !== null) {
      const [low, high] = [Math.min(lastClickedIndex.current, teamIndex), Math.max(lastClickedIndex.current, teamIndex)];
      for (let i = low; i <= high; i++) next.add(visibleTeams[i].teamId);
    } else {
      const teamId = visibleTeams[teamIndex].teamId;
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      lastClickedIndex.current = teamIndex;
    }
    setSelectedTeamIds(next);
  };

  const targetTeamIds = selectedTeamIds.size > 0 ? [...selectedTeamIds] : visibleTeams.map((t) => t.teamId);

  // ── Split evenly ──────────────────────────────────────────────────────────
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitColumn, setSplitColumn] = useState(0);
  const [splitMentorIds, setSplitMentorIds] = useState<string[]>([]);

  const applySplit = () => {
    if (splitMentorIds.length === 0) return;
    // Round-robin, skipping a candidate already sitting in another seat of
    // that row so a split never produces a repeat.
    const cells: { rowKey: string; column: number; mentorId: string }[] = [];
    let cursor = 0;
    for (const teamId of targetTeamIds) {
      const seats = seatsOf(draft[teamId], secondaryCount);
      for (let attempt = 0; attempt < splitMentorIds.length; attempt++) {
        const candidate = splitMentorIds[(cursor + attempt) % splitMentorIds.length];
        if (seats.some((id, i) => i !== splitColumn && id === candidate)) continue;
        cells.push({ rowKey: teamId, column: splitColumn, mentorId: candidate });
        cursor = (cursor + attempt + 1) % splitMentorIds.length;
        break;
      }
    }
    writeCells(cells);
    setSplitOpen(false);
    setSplitMentorIds([]);
  };

  // ── Full screen ───────────────────────────────────────────────────────────
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    // On document, not window: an open Select catches Escape on window first
    // and stops it there, so Escape closes the dropdown before the sheet.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setExpanded(false);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  // ── Rendering ─────────────────────────────────────────────────────────────
  const secondaryOptions = mentors.filter((m) => m.id !== activePrimaryId);
  const toOptions = (list: { id: string; name: string }[]) => list.map((m) => ({ value: m.id, label: m.name }));
  const mentorLabel = (id: string) => mentorNameById.get(id) ?? 'Unknown mentor';

  const visiblePrimaryIds = mentorSearch.trim()
    ? primaryIds.filter((id) => mentorLabel(id).toLowerCase().includes(mentorSearch.trim().toLowerCase()))
    : primaryIds;

  if (secondaryCount === 0) {
    return (
      <p className="text-xs text-gray-500 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        Secondary panelists is 0 — every student is scored by their primary mentor alone, so there is nothing to pair.
      </p>
    );
  }
  if (primaryIds.length === 0) {
    return (
      <p className="text-xs text-gray-500 bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        No team in this scope has a mentor yet, so there is nobody to pair a secondary with.
      </p>
    );
  }

  const renderCell = (rowKey: string, rowIndex: number, column: number) => {
    const seats = readRow(rowKey);
    const value = seats[column];
    const taken = new Set(seats.filter((id, i) => i !== column && id));
    return (
      <td key={column} className={`relative px-2 py-1.5 ${inDragRange(rowIndex, column) ? 'bg-gold/10' : ''}`}>
        {/* Mentors already in another seat of this row are left out rather
            than greyed — the shared Select has no disabled option. */}
        <Select
          value={value}
          onChange={(mentorId) => writeCells([{ rowKey, column, mentorId }])}
          options={toOptions(secondaryOptions.filter((m) => !taken.has(m.id)))}
          placeholder="— choose —"
          isSearchable
          menuMinWidth={220}
          className={`${CELL_SELECT} ${value ? '' : '!border-dashed !border-zinc-700'}`}
        />
        {value && (
          // The fill handle — drag it over other rows to copy this mentor there.
          <span
            role="button"
            aria-label="Drag to fill"
            title="Drag up or down to copy into other rows"
            onMouseDown={(e) => {
              e.preventDefault();
              setDrag({ column, mentorId: value, fromIndex: rowIndex, toIndex: rowIndex });
            }}
            className="absolute right-1 bottom-0.5 w-2 h-2 bg-gold rounded-[1px] cursor-ns-resize z-[1]"
          />
        )}
      </td>
    );
  };

  const completeCount = (primaryId: string) =>
    (teamsByPrimary.get(primaryId) ?? []).filter((t) => isRowComplete(draft[t.teamId], secondaryCount)).length;

  // Inline the lists cap their own height; full screen they take what's left.
  const listSizing = expanded ? 'flex-1 min-h-0' : 'max-h-[420px]';

  const grid = (
    <div className={`flex gap-3 ${expanded ? 'flex-1 min-h-0' : 'min-h-[320px]'} ${drag ? 'select-none' : ''}`}>
      {/* Mentors */}
      <div className={`${expanded ? 'w-64' : 'w-56'} shrink-0 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col min-h-0`}>
        <div className="p-2 border-b border-zinc-800 relative">
          <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={mentorSearch}
            onChange={(e) => setMentorSearch(e.target.value)}
            placeholder="Find mentor"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-md pl-7 pr-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold"
          />
        </div>
        <div className={`overflow-y-auto scrollbar-thin ${listSizing}`}>
          {visiblePrimaryIds.map((primaryId) => {
            const total = teamsByPrimary.get(primaryId)?.length ?? 0;
            const complete = completeCount(primaryId);
            return (
              <button
                key={primaryId}
                type="button"
                onClick={() => setSelectedPrimaryId(primaryId)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs border-l-2 transition-colors ${
                  primaryId === activePrimaryId ? 'border-gold bg-gold/5 text-white' : 'border-transparent text-gray-300 hover:bg-zinc-800'
                }`}
              >
                <span className="truncate">{mentorLabel(primaryId)}</span>
                <span className={`shrink-0 tabular-nums ${complete === total ? 'text-green-400' : 'text-gray-500'}`}>
                  {complete === total ? <Check size={12} className="inline" /> : `${complete}/${total}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sheet */}
      <div className="flex-1 min-w-0 min-h-0 bg-zinc-900 border border-zinc-800 rounded-lg flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            <p className="text-xs text-gray-400 whitespace-nowrap">
              <span className="text-white font-medium">{activePrimaryId ? mentorLabel(activePrimaryId) : ''}</span>
              {' · '}
              {teamSearch.trim() ? `${visibleTeams.length} of ${activeTeams.length}` : activeTeams.length} team
              {activeTeams.length === 1 ? '' : 's'}
              {selectedTeamIds.size > 0 && <span className="text-gold"> · {selectedTeamIds.size} selected</span>}
            </p>
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                placeholder="Find team or student"
                className="w-48 bg-zinc-800 border border-zinc-700 rounded-md pl-6 pr-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-gold"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedTeamIds.size > 0 &&
              Array.from({ length: secondaryCount }, (_, column) => (
                <Select
                  key={column}
                  value=""
                  onChange={(mentorId) =>
                    mentorId && writeCells([...selectedTeamIds].map((teamId) => ({ rowKey: teamId, column, mentorId })))
                  }
                  options={toOptions(secondaryOptions)}
                  placeholder={`Set secondary${secondaryCount > 1 ? ` ${column + 1}` : ''} for selected…`}
                  isSearchable
                  className={TOOLBAR_SELECT}
                />
              ))}
            {selectedTeamIds.size > 0 && (
              <button type="button" onClick={() => setSelectedTeamIds(new Set())} className="text-xs text-gray-400 hover:text-white">
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setSplitOpen((open) => !open)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-zinc-700 text-gray-300 hover:border-gold/40 hover:text-white"
            >
              <Shuffle size={12} />
              Split evenly
            </button>
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              title={expanded ? 'Exit full screen (Esc)' : 'Expand to full screen'}
              aria-label={expanded ? 'Exit full screen' : 'Expand to full screen'}
              className="p-1 rounded-md text-gray-400 hover:text-gold hover:bg-zinc-800 transition-colors"
            >
              {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {splitOpen && (
          <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-850 space-y-2">
            <p className="text-[11px] text-gray-400">
              Share {selectedTeamIds.size > 0 ? `the ${selectedTeamIds.size} selected teams` : `${teamSearch.trim() ? 'the' : 'all'} ${visibleTeams.length} teams`} between
              these secondaries, round-robin.
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Select
                isMulti
                value={splitMentorIds}
                onChange={setSplitMentorIds}
                options={toOptions(secondaryOptions)}
                placeholder="Choose secondaries…"
                isSearchable
                className={TOOLBAR_SELECT}
              />
              {secondaryCount > 1 && (
                <Select
                  value={String(splitColumn)}
                  onChange={(v) => setSplitColumn(Number(v))}
                  options={Array.from({ length: secondaryCount }, (_, i) => ({ value: String(i), label: `Into Secondary ${i + 1}` }))}
                  className="!px-2 !py-1 !text-xs"
                />
              )}
              <button
                type="button"
                disabled={splitMentorIds.length === 0}
                onClick={applySplit}
                className="text-xs px-2.5 py-1 rounded-md bg-gold text-black font-medium disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          </div>
        )}

        <div className={`overflow-auto scrollbar-thin ${listSizing}`}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-zinc-900 z-10">
              <tr className="text-gray-500 text-left">
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2 font-medium">Team</th>
                <th className="px-2 py-2 font-medium">Track</th>
                <th className="px-2 py-2 font-medium text-right">Students</th>
                {Array.from({ length: secondaryCount }, (_, i) => (
                  <th key={i} className="px-2 py-2 font-medium min-w-[180px]">
                    Secondary{secondaryCount > 1 ? ` ${i + 1}` : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr
                className="border-t border-zinc-800 bg-zinc-850/60"
                onMouseEnter={() => drag && setDrag({ ...drag, toIndex: 0 })}
              >
                <td className="px-2 py-1.5" />
                <td className="px-2 py-1.5 text-gray-300 italic" colSpan={3}>
                  Default — teams added later
                </td>
                {Array.from({ length: secondaryCount }, (_, column) => renderCell(DEFAULT_ROW, 0, column))}
              </tr>
              {visibleTeams.length === 0 && (
                <tr className="border-t border-zinc-800">
                  <td colSpan={4 + secondaryCount} className="px-3 py-4 text-center text-xs text-gray-500">
                    No team or student matches "{teamSearch.trim()}".
                  </td>
                </tr>
              )}
              {visibleTeams.map((team, teamIndex) => {
                const rowIndex = teamIndex + 1;
                const seats = seatsOf(draft[team.teamId], secondaryCount);
                const incomplete = !isRowComplete(seats, secondaryCount);
                return (
                  <tr
                    key={team.teamId}
                    className={`border-t border-zinc-800 ${selectedTeamIds.has(team.teamId) ? 'bg-gold/5' : ''}`}
                    onMouseEnter={() => drag && setDrag({ ...drag, toIndex: rowIndex })}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selectedTeamIds.has(team.teamId)}
                        onChange={() => undefined}
                        onClick={(e) => toggleRow(teamIndex, e.shiftKey)}
                        className="accent-gold"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-white max-w-[320px]">
                      {/* Team name with its students — "G1 (Asha, Ravi)" — since a
                          bare G-number tells an admin nothing about whose team it is. */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate min-w-0" title={teamLabel(team)}>
                          {teamLabel(team)}
                        </span>
                        {incomplete && <span className="shrink-0 text-[10px] text-amber-400">incomplete</span>}
                        {(team.lockedCount ?? 0) > 0 && (
                          <span
                            className="shrink-0 text-[10px] text-gray-500"
                            title="Already scored or closed — a change of secondary will not reach these students"
                          >
                            {team.lockedCount}/{team.assignedCount ?? team.studentCount} scored
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">{team.trackName ?? '—'}</td>
                    <td className="px-2 py-1.5 text-gray-400 text-right tabular-nums">{team.studentCount}</td>
                    {Array.from({ length: secondaryCount }, (_, column) => renderCell(team.teamId, rowIndex, column))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-3 py-2 border-t border-zinc-800 text-[11px] text-gray-500">
          Drag the <span className="inline-block w-2 h-2 bg-gold rounded-[1px] align-middle" /> handle to copy a mentor into other rows · Shift-click
          checkboxes to select a range.
        </p>
      </div>
    </div>
  );

  if (!expanded) return grid;
  // Portalled so no ancestor's transform (the modal's zoom-in) traps a fixed
  // overlay inside it. Sits above the modal (z-100), below the Select lists (z-200).
  return createPortal(
    <div className="fixed inset-0 z-[150] bg-zinc-850 p-4 flex flex-col gap-3">
      <p className="text-xs text-gray-400 shrink-0">
        Secondary panel · press <span className="text-gray-300">Esc</span> to go back
      </p>
      {grid}
    </div>,
    document.body
  );
}
