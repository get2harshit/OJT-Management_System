import { useCallback, useState } from 'react';

export interface DateRangeValue {
  startDate: string; // 'YYYY-MM-DD' or ''
  endDate: string; // 'YYYY-MM-DD' or ''
}

const NO_DATE_RANGE: DateRangeValue = { startDate: '', endDate: '' };

/** '_2026-11-01_to_2026-11-15' for an export's file name, or '' with no range. */
export function dateRangeFileSuffix(range: DateRangeValue): string {
  return range.startDate && range.endDate ? `_${range.startDate}_to_${range.endDate}` : '';
}

/**
 * State for a DateRangePicker that filters a server-paged list.
 *
 * Keeps two ranges: the one the calendar shows (`pickedRange`) and the one
 * the list is filtered by (`appliedRange`). The second only moves once both
 * ends are picked or the range is cleared, so the first click of a new range
 * does not reload the table with half a filter. `onApply` runs on each
 * applied change (e.g. to go back to page 1).
 */
export function useDateRangeFilter(onApply?: () => void) {
  const [pickedRange, setPickedRange] = useState<DateRangeValue>(NO_DATE_RANGE);
  const [appliedRange, setAppliedRange] = useState<DateRangeValue>(NO_DATE_RANGE);

  const handleRangeChange = useCallback(
    (range: DateRangeValue) => {
      setPickedRange(range);
      const isComplete = !!range.startDate && !!range.endDate;
      const isCleared = !range.startDate && !range.endDate;
      if (isComplete || isCleared) {
        setAppliedRange(range);
        onApply?.();
      }
    },
    [onApply]
  );

  return {
    pickedRange,
    appliedRange,
    handleRangeChange,
    /** The applied range as API params; both undefined when no range is set. */
    from: appliedRange.startDate || undefined,
    to: appliedRange.endDate || undefined,
  };
}
