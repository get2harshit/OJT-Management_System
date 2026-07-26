import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Search } from 'lucide-react';

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
  // When provided, `items` is assumed already filtered server-side (e.g. a
  // paginated roster) and rendered as-is instead of being filtered again
  // client-side. Every keystroke is still reported here immediately —
  // debouncing before it actually triggers a fetch is the caller's job
  // (mirrors DataTable's onSearchChange). Omit for the original behavior:
  // an unbounded `items` list searched entirely client-side (mentor/student
  // Submissions pages, whose rosters are small and never paginated).
  onSearchChange?: (value: string) => void;
  // Server pagination footer — omit for the original unpaginated behavior.
  pagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
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
  onSearchChange,
  pagination,
}: RosterListProps) {
  const [search, setSearch] = useState('');
  const isServerDriven = onSearchChange !== undefined;

  const filtered = useMemo(() => {
    if (isServerDriven) return items;
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.primaryLabel.toLowerCase().includes(q) || i.secondaryLabel?.toLowerCase().includes(q)
    );
  }, [items, search, isServerDriven]);

  const handleSearchInput = (value: string) => {
    setSearch(value);
    onSearchChange?.(value);
  };

  return (
    <>
      <div className="p-3 border-b border-zinc-750 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={search}
            onChange={(e) => handleSearchInput(e.target.value)}
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

      {pagination && pagination.totalPages > 1 && (
        <div className="shrink-0 p-2 border-t border-zinc-750 flex items-center justify-between gap-2">
          <button
            onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
            disabled={pagination.page === 1}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[10px] text-gray-500">
            Page {pagination.page} / {pagination.totalPages}
          </span>
          <button
            onClick={() => pagination.onPageChange(Math.min(pagination.totalPages, pagination.page + 1))}
            disabled={pagination.page === pagination.totalPages}
            className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </>
  );
}
