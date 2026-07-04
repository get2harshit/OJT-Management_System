import { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { formatDateDisplay } from '../lib/utils';

interface DateRangePickerProps {
  startDate: string; // 'YYYY-MM-DD' or ''
  endDate: string; // 'YYYY-MM-DD' or ''
  onRangeChange: (range: { startDate: string; endDate: string }) => void;
  disabled?: boolean;
}

function toDateOnlyString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateOnlyString(value: string): Date | undefined {
  if (!value) return undefined;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DateRangePicker({ startDate, endDate, onRangeChange, disabled }: DateRangePickerProps) {
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

  const handleSelect = (range: DateRange | undefined) => {
    const nextStart = range?.from ? toDateOnlyString(range.from) : '';
    const nextEnd = range?.to ? toDateOnlyString(range.to) : '';
    const hadNoEnd = !endDate;
    onRangeChange({ startDate: nextStart, endDate: nextEnd });
    // Auto-close once a full range (both ends) has just been completed.
    if (nextStart && nextEnd && hadNoEnd) {
      setOpen(false);
    }
  };

  const label = startDate
    ? `${formatDateDisplay(startDate)}  →  ${endDate ? formatDateDisplay(endDate) : 'Select end date'}`
    : 'Select date range';

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:border-gold transition-colors ${
          startDate ? 'text-white' : 'text-gray-500'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-zinc-650'}`}
      >
        <CalendarIcon size={16} className="text-gold shrink-0" />
        <span className="truncate">{label}</span>
      </button>

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
            defaultMonth={selectedRange?.from}
          />
        </div>
      )}
    </div>
  );
}
