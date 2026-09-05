import { RATING_LEVELS, MAX_RATING } from '../lib/api/skillAssessments';

/**
 * The framework's five-point scale, as a control that shows what each point
 * means.
 *
 * Replaces the five stars this used to be. Stars say "how good, out of five"
 * — the framework says something different and more specific: 4 is "can
 * demonstrate this independently at a junior-engineer level", which is a bar,
 * not a quantity. A mentor picking between two numbers without those words in
 * front of them is inventing their own rubric, and fifty mentors inventing
 * fifty rubrics is what makes ratings incomparable across an OJT.
 */
export default function RatingScaleInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup">
      {RATING_LEVELS.map((level) => {
        const active = value === level.value;
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(level.value)}
            title={level.description}
            className={`rounded-lg border px-2 py-1.5 text-left transition-colors focus:outline-none focus:ring-1 focus:ring-gold/60 ${
              active
                ? 'bg-gold text-black border-gold'
                : 'bg-zinc-900 border-zinc-750 text-gray-400 hover:border-gray-600 hover:text-gray-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className="block text-sm font-bold tabular-nums leading-none">{level.value}</span>
            <span className={`block text-[10px] leading-tight mt-1 ${active ? 'text-black/70' : 'text-gray-500'}`}>
              {level.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * A rating read back, for one parameter a mentor actually chose.
 *
 * The level name is only shown for a whole number, because only a whole number
 * is a level. An average of 3.4 rounded to "Independent" would put a word on a
 * value nobody selected and quietly overstate a student by up to half a point
 * — averages get ScoreBar instead.
 */
export function RatingValue({ value, className = '' }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined) {
    return <span className={`text-[11px] text-gray-600 ${className}`}>—</span>;
  }
  const level = Number.isInteger(value) ? RATING_LEVELS.find((l) => l.value === value) : undefined;
  return (
    <span
      title={level?.description}
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-200 ${className}`}
    >
      <span className="tabular-nums">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
      {level && <span className="text-gray-500 font-normal">{level.label}</span>}
    </span>
  );
}

/**
 * A derived figure — a dimension average or a final rating — as a labelled bar.
 *
 * A bar rather than a bare number because the question a mentor asks of these
 * four figures is "where is this student strong and where are they weak", and
 * comparing decimals to answer it is work the screen should have done. The
 * denominator is always printed: 3.40 means nothing without knowing it is out
 * of 5.
 */
export function ScoreBar({
  label,
  value,
  sublabel,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  sublabel?: string;
  emphasis?: boolean;
}) {
  const pct = value === null ? 0 : (value / MAX_RATING) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={emphasis ? 'text-xs text-gray-200 font-semibold' : 'text-[11px] text-gray-400'}>{label}</span>
        <span className="tabular-nums shrink-0">
          {value === null ? (
            <span className="text-[11px] text-gray-600">not rated</span>
          ) : (
            <>
              <span className={emphasis ? 'text-sm font-bold text-gold' : 'text-xs font-semibold text-white'}>
                {value.toFixed(2)}
              </span>
              <span className="text-[11px] text-gray-500"> / {MAX_RATING}</span>
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-750 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${emphasis ? 'bg-gold' : 'bg-gold/50'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {sublabel && <p className="text-[10px] text-gray-500 leading-snug">{sublabel}</p>}
    </div>
  );
}
