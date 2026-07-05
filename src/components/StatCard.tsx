import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  onClick?: () => void;
}

// When onClick is supplied the card becomes a real <button> (so it's
// keyboard/screen-reader accessible) that jumps to the relevant tab;
// otherwise it stays a plain, non-interactive stat display.
export default function StatCard({ title, value, icon: Icon, trend, onClick }: StatCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`w-full text-left bg-zinc-850 border border-zinc-750 rounded-xl p-5 hover:border-gold/30 transition-all duration-300 hover:shadow-lg hover:shadow-gold/5 group ${
        onClick ? 'cursor-pointer hover:-translate-y-0.5' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 rounded-lg bg-zinc-750 group-hover:bg-gold/10 transition-colors">
          <Icon size={20} className="text-gold" />
        </div>
        {trend && (
          <span className="text-xs font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-400 mt-1">{title}</p>
    </Wrapper>
  );
}
