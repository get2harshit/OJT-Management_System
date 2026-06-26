import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
}

export default function StatCard({ title, value, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl p-5 hover:border-gold/30 transition-all duration-300 hover:shadow-lg hover:shadow-gold/5 group">
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
    </div>
  );
}
