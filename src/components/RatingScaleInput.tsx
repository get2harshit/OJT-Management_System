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
  previousValue = null,
}: {
  value: number | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
  /**
   * What this same parameter was rated last cycle, marked on the scale itself
   * rather than printed beside it — the mentor is already looking here, so
   * the comparison costs them no second glance, and "went from 3 to 4" reads
   * as a distance across the row instead of as arithmetic.
   *
   * Reference only. It is deliberately NOT used to preselect anything: a
   * prefilled form is one a mentor can save without having judged a single
   * parameter, and this table exists to show a trend that only means
   * something if every snapshot was actually rated.
   *
   * Null/undefined renders exactly as this control always has, which is what
   * a first assessment — and a student whose last snapshot was written under
   * the earlier nine-parameter rubric — should get.
   */
  previousValue?: number | null;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup">
      {RATING_LEVELS.map((level) => {
        const active = value === level.value;
        const previous = previousValue === level.value;
        return (
          <button
            key={level.value}
            type="button"
            role="radio"
            aria-checked={active}
            // The marker is a dashed border and a dot, so it survives being
            // read out as well as being looked at — colour alone would say
            // nothing here to a mentor who cannot see the difference.
            aria-label={`${level.value}, ${level.label}${previous ? ', previously marked' : ''}`}
            disabled={disabled}
            onClick={() => onChange(level.value)}
            title={previous ? `${level.description} — previously marked` : level.description}
            /* Two states, one visual language: filled gold is the rating being
               given now, a dashed gold outline is the one given last cycle.
               Fill against outline is what keeps them apart at a glance — a
               second filled colour would read as a second selection, and the
               control has to stay unambiguous about which rating is about to
               be saved. */
            className={`relative rounded-lg border px-2 py-1.5 text-left transition-colors focus:outline-none focus:ring-1 focus:ring-gold/60 ${
              active
                ? 'bg-gold text-black border-gold'
                : previous
                  ? 'bg-gold/5 border-dashed border-gold/50 text-gray-200 hover:border-gold/80'
                  : 'bg-zinc-900 border-zinc-750 text-gray-400 hover:border-gray-600 hover:text-gray-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {/* Kept when this is also the current selection — "same as last
                cycle" is a real answer and should look like one, rather than
                like the previous rating having disappeared. On gold it goes
                dark, the same way the label below already does. */}
            {previous && (
              <span
                aria-hidden="true"
                className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${active ? 'bg-black/50' : 'bg-gold/70'}`}
              />
            )}
            <span className="block text-sm font-bold tabular-nums leading-none">{level.value}</span>
            <span
              className={`block text-[10px] leading-tight mt-1 ${
                active ? 'text-black/70' : previous ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
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
 * Which tier a dimension value falls in, matching the framework's own scale:
 * below 2.5 is "Not Ready" territory, 2.5-4 is "Developing", 4 and up is
 * "Independent"/"Strong". Only used for the non-emphasis bars below — the
 * headline "Overall rating" stays gold regardless, since it isn't one figure
 * being scanned against others the way the three dimensions are.
 */
function scoreTier(value: number): { bar: string; text: string } {
  if (value < 2.5) return { bar: 'bg-red-500/70', text: 'text-red-400' };
  if (value < 4) return { bar: 'bg-amber-500/70', text: 'text-amber-400' };
  return { bar: 'bg-gold/60', text: 'text-white' };
}

/**
 * A derived figure — a dimension average or a final rating — as a labelled bar.
 *
 * A bar rather than a bare number because the question a mentor asks of these
 * four figures is "where is this student strong and where are they weak", and
 * comparing decimals to answer it is work the screen should have done. The
 * denominator is always printed: 3.40 means nothing without knowing it is out
 * of 5.
 *
 * Non-emphasis bars are also colour-coded by tier (see scoreTier) — scanning
 * a roster of students for "who needs attention" by reading every decimal is
 * exactly the work a bar is supposed to save.
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
  const tier = value === null ? null : scoreTier(value);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={emphasis ? 'text-xs text-gray-200 font-semibold' : 'text-[11px] text-gray-400'}>{label}</span>
        <span className="tabular-nums shrink-0">
          {value === null ? (
            <span className="text-[11px] text-gray-600">not rated</span>
          ) : (
            <>
              <span className={emphasis ? 'text-sm font-bold text-gold' : `text-xs font-semibold ${tier!.text}`}>
                {value.toFixed(2)}
              </span>
              <span className="text-[11px] text-gray-500"> / {MAX_RATING}</span>
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-750 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${emphasis ? 'bg-gold' : tier?.bar ?? 'bg-gold/50'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {sublabel && <p className="text-[10px] text-gray-500 leading-snug">{sublabel}</p>}
    </div>
  );
}
