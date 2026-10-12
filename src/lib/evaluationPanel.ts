/**
 * Shapes shared by the evaluation panel grid and the modals that own its
 * state (Add wizard, Edit). Kept out of the grid component so it exports only
 * a component.
 */

/** teamId (or primaryMentorId, for defaults) -> one entry per secondary seat, '' for an empty seat. */
export type PanelDraft = Record<string, string[]>;

/** A row's seats padded or trimmed to the panel size, so every row has one entry per column. */
export function seatsOf(row: string[] | undefined, secondaryCount: number): string[] {
  return Array.from({ length: secondaryCount }, (_, i) => row?.[i] ?? '');
}

/** Is every seat of this row filled, with no repeats? */
export function isRowComplete(row: string[] | undefined, secondaryCount: number): boolean {
  const seats = seatsOf(row, secondaryCount);
  return seats.every(Boolean) && new Set(seats).size === seats.length;
}
