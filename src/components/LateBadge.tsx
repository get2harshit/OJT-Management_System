import { Clock } from 'lucide-react';
import { formatLateBy } from '../lib/submissionDisplay';

/**
 * A red "Late" pill for work first submitted after its due date. Renders
 * nothing when on time, or when lateness is unknown for this row.
 */
export default function LateBadge({ lateByMs, compact = false }: { lateByMs?: number | null; compact?: boolean }) {
  if (!lateByMs) return null;
  const by = formatLateBy(lateByMs);
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border bg-red-500/10 text-red-400 border-red-500/25 shrink-0"
      title={`First submitted ${by} after the due date`}
    >
      <Clock size={10} />
      {compact ? 'Late' : `Late · ${by}`}
    </span>
  );
}
