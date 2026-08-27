import { computeWeekOccurrenceDates } from '../lib/utils';

export interface RecurringScheduleValue {
  startDate: string; // YYYY-MM-DD — anchors the 7-day window
  startTimeOfDay: string; // HH:mm, local
  endTimeOfDay: string; // HH:mm, local
  weekdays: number[]; // 0=Sun..6=Sat
}

export const EMPTY_RECURRING_SCHEDULE: RecurringScheduleValue = {
  startDate: '',
  startTimeOfDay: '',
  endTimeOfDay: '',
  weekdays: [],
};

const WEEKDAY_LABELS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

const INPUT_CLASS =
  'w-full bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold';

/**
 * The one-week/weekday-checkbox picker behind recurring session booking.
 * Purely presentational — occurrence dates are derived from `value` by the
 * caller (via computeWeekOccurrenceDates) only at submit time, combined with
 * the caller's own mentor/team/title fields into one create-recurring
 * request. No API calls here.
 */
export default function RecurringSchedulePicker({
  value,
  onChange,
}: {
  value: RecurringScheduleValue;
  onChange: (value: RecurringScheduleValue) => void;
}) {
  const toggleWeekday = (weekday: number) => {
    const next = value.weekdays.includes(weekday)
      ? value.weekdays.filter((w) => w !== weekday)
      : [...value.weekdays, weekday];
    onChange({ ...value, weekdays: next });
  };

  const preview =
    value.startDate && value.weekdays.length > 0
      ? computeWeekOccurrenceDates(value.startDate, value.weekdays)
      : [];

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Week starting</label>
        <input
          type="date"
          value={value.startDate}
          onChange={(e) => onChange({ ...value, startDate: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">Repeat on</label>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_LABELS.map(({ value: weekday, label }) => {
            const active = value.weekdays.includes(weekday);
            return (
              <button
                key={weekday}
                type="button"
                onClick={() => toggleWeekday(weekday)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                  active
                    ? 'bg-gold text-black border-gold'
                    : 'bg-zinc-900 text-gray-400 border-zinc-750 hover:border-gray-500'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">Start time</label>
          <input
            type="time"
            value={value.startTimeOfDay}
            onChange={(e) => onChange({ ...value, startTimeOfDay: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1 block">End time</label>
          <input
            type="time"
            value={value.endTimeOfDay}
            onChange={(e) => onChange({ ...value, endTimeOfDay: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
      </div>
      {preview.length > 0 && (
        <p className="text-[11px] text-gray-500">
          Will book on: {preview.map((d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })).join(', ')}
        </p>
      )}
    </div>
  );
}
