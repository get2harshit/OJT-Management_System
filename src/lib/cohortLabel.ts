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
