import { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { formatDateDisplay, toLocalDateOnly } from '../lib/utils';

interface DateRangePickerProps {
  startDate: string; // 'YYYY-MM-DD' or ''
  endDate: string; // 'YYYY-MM-DD' or ''
  onRangeChange: (range: { startDate: string; endDate: string }) => void;
  disabled?: boolean;
  /** 'form' fills its field; 'filter' is the compact pill used in table filter bars. */
  variant?: 'form' | 'filter';
  placeholder?: string;
  /** Days after this one ('YYYY-MM-DD') cannot be picked. */
  maxDate?: string;
  /** Shows an × that empties the range. */
  clearable?: boolean;
}

function parseDateOnlyString(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const TRIGGER_CLASSES = {
  form: 'w-full bg-zinc-750 border-zinc-750 px-3 py-2 text-sm',
  filter: 'bg-zinc-850 border-zinc-750 px-2.5 py-1.5 text-xs',
} as const;

export default function DateRangePicker({
  startDate,
  endDate,
  onRangeChange,
  disabled,
  variant = 'form',
  placeholder = 'Select date range',
  maxDate,
  clearable,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedRange: DateRange | undefined = startDate
    ? { from: parseDateOnlyString(startDate), to: parseDateOnlyString(endDate) }
    : undefined;
  const latestPickable = maxDate ? parseDateOnlyString(maxDate) : undefined;

  // react-day-picker's range mode always hands back from <= to: a click
  // before the current start moves the start, so the range cannot come out
  // reversed.
  const handleSelect = (picked: DateRange | undefined, clickedDay: Date) => {
    // With min=1 the library reads a second click on the start day as
    // "clear". Read it as a one-day range instead, so start = end is
    // pickable: click a day twice.
    const isSecondClickOnStart = !picked && !!startDate && !endDate && toLocalDateOnly(clickedDay) === startDate;
    const range: DateRange | undefined = isSecondClickOnStart ? { from: clickedDay, to: clickedDay } : picked;
    const nextStart = range?.from ? toLocalDateOnly(range.from) : '';
    const nextEnd = range?.to ? toLocalDateOnly(range.to) : '';
    const hadNoEnd = !endDate;
    onRangeChange({ startDate: nextStart, endDate: nextEnd });
    // Auto-close once a full range (both ends) has just been completed.
    if (nextStart && nextEnd && hadNoEnd) {
      setOpen(false);
    }
  };

  const label = startDate
    ? `${formatDateDisplay(startDate)}  →  ${endDate ? formatDateDisplay(endDate) : 'Select end date'}`
    : placeholder;
  const showClear = clearable && !!startDate && !disabled;

  return (
    <div className={`relative ${variant === 'filter' ? 'shrink-0' : ''}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 border rounded-lg text-left focus:outline-none focus:border-gold transition-colors ${
          TRIGGER_CLASSES[variant]
        } ${startDate ? 'text-white' : 'text-gray-500'} ${
          variant === 'filter' && startDate ? '!border-gold/40 !bg-gold/5' : ''
        } ${showClear ? 'pr-7' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-zinc-650'}`}
      >
        <CalendarIcon size={variant === 'filter' ? 13 : 16} className="text-gold shrink-0" />
        <span className="truncate whitespace-nowrap">{label}</span>
      </button>

      {showClear && (
        <button
          type="button"
          onClick={() => {
            onRangeChange({ startDate: '', endDate: '' });
            setOpen(false);
          }}
          aria-label="Clear date range"
          title="Clear date range"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-white"
        >
          <X size={13} />
        </button>
      )}

      {open && !disabled && (
        <div className="absolute z-[60] mt-2 bg-zinc-850 border border-zinc-750 rounded-xl shadow-2xl p-3">
          <DayPicker
            mode="range"
            numberOfMonths={1}
            // min=1 keeps the first click as a "from"-only selection (react-day-picker's
            // default min=0 collapses the first click into a same-day {from, to} range).
            min={1}
            selected={selectedRange}
            onSelect={handleSelect}
            defaultMonth={selectedRange?.from ?? latestPickable}
            disabled={latestPickable ? { after: latestPickable } : undefined}
            endMonth={latestPickable}
          />
          <p className="mt-1 px-1 text-[11px] text-gray-500">Click a start and an end day. For one day, click it twice.</p>
        </div>
      )}
    </div>
  );
}
