import type { Cohort, SemesterSession } from './types';
import { SEMESTER_SESSION_LABELS } from './constants';

export function getSemesterSessionLabel(session: SemesterSession | undefined | null): string {
  if (!session) return '';
  return SEMESTER_SESSION_LABELS[session] ?? session;
}

// Human-readable cohort label: the cohort's name if set, otherwise its
// allowed batch(es) plus a formatted semester ("Odd"/"Even"). Shared so every
// page displays cohorts the same way instead of each rolling its own ternary.
export function getCohortLabel(cohort: Pick<Cohort, 'name' | 'allowedBatches' | 'sessionTerm'> | null | undefined): string {
  if (!cohort) return '';
  const allowedBatches = Array.isArray(cohort.allowedBatches) ? cohort.allowedBatches : [cohort.allowedBatches].filter(Boolean);
  return cohort.name || `${allowedBatches.join(', ')} — ${getSemesterSessionLabel(cohort.sessionTerm)}`;
}

type CohortOptionSource = Pick<Cohort, 'id' | 'name' | 'allowedBatches' | 'sessionTerm' | 'startDate'>;

/**
 * `{ value, label }` options for a cohort `<Select>`, built from
 * getCohortLabel — except when two cohorts in the same list land on the
 * identical label. That's a real, recurring situation here: a cohort's name
 * is auto-generated from its start month alone ("OJT August 2026"), not from
 * which student batches it covers, so two genuinely different cohorts
 * legitimately collide on name. Left alone, every dropdown in the app shows
 * indistinguishable entries and there is no way to tell which one actually
 * has the data you're looking for. Only the colliding entries get a
 * start-date suffix — a list with no collisions renders exactly as
 * getCohortLabel already did.
 */
export function buildCohortOptions(cohorts: CohortOptionSource[]): { value: string; label: string }[] {
  const labelCounts = new Map<string, number>();
  for (const cohort of cohorts) {
    const label = getCohortLabel(cohort);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  return cohorts.map((cohort) => {
    const label = getCohortLabel(cohort);
    if ((labelCounts.get(label) ?? 0) <= 1) return { value: cohort.id, label };
    const startedOn = new Date(cohort.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return { value: cohort.id, label: `${label} (from ${startedOn})` };
  });
}
