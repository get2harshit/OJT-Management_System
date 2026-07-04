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

// Derives Allowed Batches / Semester / Cohort Name from the OJT Start Date.
// A B.Tech program runs 4 years and the academic year turns over every
// August, so of the 5 batches whose span overlaps the start year Y, the
// (Y-4)-Y batch has already graduated (finishes before an August start).
// The remaining 4 — the 3 already mid-program plus the just-starting
// Y-(Y+4) batch — are offered as selectable options; only the 3 mid-program
// batches are auto-checked, the newly-starting batch is left for the admin
// to opt into manually.
//
// Semester: the backend only *enforces* Jun-Aug -> ODD and Jan-Apr -> EVEN
// (May and Sep-Dec aren't validated), so Jan-May -> EVEN / Jun-Dec -> ODD is
// the split that satisfies the backend's hard constraints while still
// picking something sensible for the unconstrained months.
export function computeCohortDefaultsFromStartDate(startDate: string): {
  eligibleBatchOptions: string[];
  allowedBatches: string[];
  sessionTerm: SemesterSession;
  name: string;
} {
  const [yearStr, monthStr] = startDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12

  const allowedBatches = [
    `${year - 3}-${year + 1}`,
    `${year - 2}-${year + 2}`,
    `${year - 1}-${year + 3}`,
  ];
  const eligibleBatchOptions = [...allowedBatches, `${year}-${year + 4}`];

  const sessionTerm: SemesterSession = month <= 5 ? 'EVEN' : 'ODD';

  const name = `OJT ${MONTH_NAMES[month - 1]} ${year}`;

  return { eligibleBatchOptions, allowedBatches, sessionTerm, name };
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
  const invalidBatch = form.allowedBatches.find(batch => {
    const match = batch.match(/^(\d{4})-(\d{4})$/);
    return !match || Number(match[2]) - Number(match[1]) !== 4;
  });
  if (invalidBatch) {
    return 'Allowed Batches must be 4-year B.Tech spans in the format YYYY-YYYY, e.g. 2024-2028';
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
