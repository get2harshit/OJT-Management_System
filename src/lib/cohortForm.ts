import type { SemesterSession } from './types';
import { formatDateDisplay } from './utils';

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const COHORT_NAME_REGEX = new RegExp(`^OJT (${MONTH_NAMES.join('|')}) [0-9]{4}$`);

export interface CohortFormState {
  name: string;
  allowedBatches: string[];
  sessionTerm: SemesterSession;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export const EMPTY_COHORT_FORM: CohortFormState = {
  name: '',
  allowedBatches: [],
  sessionTerm: 'ODD',
  startDate: '',
  endDate: '',
  isActive: true,
};

// Derives Semester / Cohort Name from the OJT Start Date. Allowed Batches are
// no longer guessed from the start date — batches follow the college's own
// "YYYY <Section>" codes (e.g. "2025 A"), which have no fixed relationship
// to a cohort's start year, so the admin picks them from the real list of
// batches in use (see apiListStudentBatches) instead.
//
// Semester: the backend only *enforces* Jun-Aug -> ODD and Jan-Apr -> EVEN
// (May and Sep-Dec aren't validated), so Jan-May -> EVEN / Jun-Dec -> ODD is
// the split that satisfies the backend's hard constraints while still
// picking something sensible for the unconstrained months.
export function computeCohortDefaultsFromStartDate(startDate: string): {
  sessionTerm: SemesterSession;
  name: string;
} {
  const [yearStr, monthStr] = startDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12

  const sessionTerm: SemesterSession = month <= 5 ? 'EVEN' : 'ODD';

  const name = `OJT ${MONTH_NAMES[month - 1]} ${year}`;

  return { sessionTerm, name };
}

// Mirrors the backend's own minimum-duration rule (CohortService.ts):
// End Date must be at least 3 calendar months after Start Date.
export function getMinEndDate(startDate: string): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const min = new Date(y, m - 1, d);
  min.setMonth(min.getMonth() + 3);
  const yy = min.getFullYear();
  const mm = String(min.getMonth() + 1).padStart(2, '0');
  const dd = String(min.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Returns an error message if the form is invalid, otherwise null.
export function validateCohortForm(form: CohortFormState): string | null {
  if (!form.name || form.allowedBatches.length === 0 || !form.startDate || !form.endDate) {
    return 'Please fill in all required fields.';
  }
  if (!COHORT_NAME_REGEX.test(form.name)) {
    return 'Cohort Name must be in the format "OJT <Month> <Year>", e.g. OJT August 2026';
  }
  const invalidBatch = form.allowedBatches.find(batch => !/^\d{4} [A-Z]$/.test(batch));
  if (invalidBatch) {
    return 'Allowed Batches must be in the format "YYYY X", e.g. 2025 A';
  }
  if (form.startDate >= form.endDate) {
    return 'End Date must be strictly after Start Date';
  }
  const minEndDate = getMinEndDate(form.startDate);
  if (form.endDate < minEndDate) {
    return `End Date must be at least 3 months after Start Date (on or after ${formatDateDisplay(minEndDate)})`;
  }
  return null;
}
