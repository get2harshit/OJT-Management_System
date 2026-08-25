import type { LucideIcon } from 'lucide-react';

/**
 * One glance-stat card — an icon, a label, and a big number. Shared by
 * `mentor/WorkSummary.tsx` (sessions delivered / hours delivered / teams
 * mentored) and `admin/Payouts.tsx` (sessions / total hours for whatever
 * filter is active) so both keep the exact same tile rather than two
 * near-identical copies of the same markup.
 */
export default function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-400">
        <Icon size={15} />
        <p className="text-xs uppercase tracking-wider font-bold">{label}</p>
      </div>
      <p className={`text-3xl font-bold mt-2 ${tone}`}>{value}</p>
    </div>
  );
}
