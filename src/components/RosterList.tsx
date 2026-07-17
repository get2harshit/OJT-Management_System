import { useMemo, useState } from 'react';
import { CheckCircle2, Search } from 'lucide-react';

export interface RosterItem {
  id: string;
  primaryLabel: string;
  secondaryLabel?: string;
  badge?: number;
  done?: boolean;
}

interface RosterListProps {
  items: RosterItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

// Searchable list-of-entities sidebar (students, or a student's own document
// types) used as the left pane of the Submissions split view across all
// three roles. Modeled on the assignee rows in admin/Tasks.tsx's Assignee
// Progress Board, extracted so it isn't copy-pasted per role.
export default function RosterList({
  items,
  selectedId,
  onSelect,
  searchPlaceholder = 'Search...',
  emptyMessage = 'Nothing to show.',
}: RosterListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.primaryLabel.toLowerCase().includes(q) || i.secondaryLabel?.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <>
      <div className="p-3 border-b border-zinc-750 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-zinc-900 border border-zinc-750 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-gold transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-6 px-2">{emptyMessage}</p>
        ) : (
          filtered.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg transition-all flex items-center justify-between gap-2 group ${
                  isSelected
                    ? 'bg-gold/10 border border-gold/25 text-white'
                    : 'hover:bg-zinc-800 text-gray-400 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      isSelected ? 'bg-gold/20 text-gold' : 'bg-zinc-700 text-gray-300 group-hover:bg-zinc-600'
                    }`}
                  >
                    {item.primaryLabel.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-medium truncate flex items-center gap-1 ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                      {item.primaryLabel}
                      {item.done && <CheckCircle2 size={12} className="text-green-400 shrink-0" />}
                    </p>
                    {item.secondaryLabel && (
                      <p className="text-[10px] text-zinc-500 truncate">{item.secondaryLabel}</p>
                    )}
                  </div>
                </div>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-700 text-gray-300 shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}
