export const BASE_PAGE_SIZE = 20;

/**
 * The page sizes worth offering for a list that holds `total` rows.
 *
 * Doubling from a base and ending at the total itself: 489 rows offers
 * 20/40/80/160/320/All. Every screen used to hand in its own hardcoded list,
 * so a table of 489 students offered 500, 1000 and 2000 — three ways to ask
 * for rows that do not exist — while another list stopped at 100 on top of
 * thousands. The row count is the only thing that can answer this, and every
 * one of those screens already had it.
 *
 * The last entry is the total rather than the next power up, because it is the
 * one people actually reach for ("just show me everything"), and because a
 * button reading 160 above a list of 100 is claiming something untrue.
 *
 * Empty when a single page already holds everything — there is no choice to
 * make, so nothing is shown.
 *
 * Lives here rather than inside DataTable because the paginated grids use it
 * too: the rule is about how much data there is, not about tables.
 */
export function derivePageSizeOptions(total: number, base: number = BASE_PAGE_SIZE): number[] {
  if (total <= base) return [];
  const options: number[] = [];
  for (let size = base; size < total; size *= 2) options.push(size);
  options.push(total);
  return options;
}
