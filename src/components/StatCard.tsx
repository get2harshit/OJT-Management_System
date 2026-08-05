import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  onClick?: () => void;
}

export default function StatCard({ title, value, icon: Icon, trend, onClick }: StatCardProps) {
  const isInteractive = Boolean(onClick);
  const Wrapper = isInteractive ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={`w-full text-left bg-zinc-850 border rounded-xl p-5 transition-all duration-300 group ${
        isInteractive
          ? 'border-zinc-750 hover:border-gold/50 hover:-translate-y-1 hover:shadow-xl hover:shadow-gold/10 cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold'
          : 'border-zinc-800 cursor-default opacity-95'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg transition-colors ${isInteractive ? 'bg-zinc-750 group-hover:bg-gold/15' : 'bg-zinc-800'}`}>
          <Icon size={20} className={isInteractive ? 'text-gold' : 'text-gray-400'} />
        </div>
        <div className="flex items-center gap-1.5">
          {trend && (
            <span className="text-xs font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
              {trend}
            </span>
          )}
          {isInteractive && (
            <ArrowUpRight size={15} className="text-gray-500 group-hover:text-gold transition-colors opacity-70 group-hover:opacity-100" />
          )}
        </div>
      </div>
      <p className="text-2xl font-bold text-white truncate" title={String(value)}>{value}</p>
      <p className="text-sm text-gray-400 mt-1 truncate" title={title}>{title}</p>
    </Wrapper>
  );
}
