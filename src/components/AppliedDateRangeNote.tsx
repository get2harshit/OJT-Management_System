import type { DateRangeValue } from '../hooks/useDateRangeFilter';
import { formatDateDisplay } from '../lib/utils';

/** " Showing sessions from X to Y only." — nothing when no range is applied. */
export default function AppliedDateRangeNote({ range }: { range: DateRangeValue }) {
  if (!range.startDate || !range.endDate) return null;
  return (
    <>
      {' '}Showing sessions from <span className="text-gray-300">{formatDateDisplay(range.startDate)}</span> to{' '}
      <span className="text-gray-300">{formatDateDisplay(range.endDate)}</span> only.
    </>
  );
}
