// The shape of a batch code: a 4-digit admission year, one space, then a
// section that starts with a letter and may go on with letters, digits or &
// — "2025 A", "2026 A1", "2026 P&C".
//
// A copy of the backend's BATCH_CODE_PATTERN (domain/trackEligibility.ts).
// The two must stay identical: a code this accepts and the backend refuses
// only fails later, on save, with a less helpful message.
export const BATCH_CODE_PATTERN = /^\d{4} [A-Z][A-Z0-9&]*$/;

export const BATCH_CODE_FORMAT_HINT = '"YYYY SECTION" (e.g. 2025 A, 2026 A1, 2026 P&C)';

export function isValidBatchCode(batch: string): boolean {
  return BATCH_CODE_PATTERN.test(batch);
}
