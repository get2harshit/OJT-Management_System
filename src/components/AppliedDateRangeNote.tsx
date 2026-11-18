import type { ReactNode } from 'react';
import type { DateRangeValue } from '../hooks/useDateRangeFilter';
import { formatDateDisplay } from '../lib/utils';

/**
 * " Showing sessions from X to Y only." — nothing when no range is applied.
 * children follow the sentence, and show only while a range is applied.
 */
export default function AppliedDateRangeNote({ range, children }: { range: DateRangeValue; children?: ReactNode }) {
  if (!range.startDate || !range.endDate) return null;
  return (
    <>
      {' '}Showing sessions from <span className="text-gray-300">{formatDateDisplay(range.startDate)}</span> to{' '}
      <span className="text-gray-300">{formatDateDisplay(range.endDate)}</span> only.
      {children}
    </>
  );
}
