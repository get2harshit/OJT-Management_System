import { useEffect, useState } from 'react';
import { CheckSquare, Square, ChevronLeft, ChevronRight } from 'lucide-react';
import SpinnerSquare from '../../../components/SpinnerSquare';

const PAGE_SIZE = 24;

// Generic multi-select grid: the Select Project/Student/Mentor pages are all
// the same search + select-all + card-grid + save shell around different
// data and card content, so the shell lives here once and each caller only
// supplies what's actually different (via renderCard/getId/onSelectAll).
interface SelectEntityGridProps<T> {
  description: string;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchPlaceholder: string;
  items: T[];
  getId: (item: T) => string;
  selectedIds: string[];
  onSelectAll: () => void;
  allSelected: boolean;
  renderCard: (item: T, selected: boolean) => React.ReactNode;
  loading?: boolean;
  saving?: boolean;
  onSave: () => void;
  onCancel: () => void;
  emptyMessage?: string;
  rightAction?: React.ReactNode;
}

export default function SelectEntityGrid<T>({
  description,
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder,
  items,
  getId,
  selectedIds,
  onSelectAll,
  allSelected,
  renderCard,
  loading = false,
  saving = false,
  onSave,
  onCancel,
  emptyMessage = 'No results found.',
  rightAction,
}: SelectEntityGridProps<T>) {
  // Select All still acts on the full `items` list (all filtered results) —
  // only the on-screen grid is paginated, so it never limits what gets selected.
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-400">{description}</p>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearchQueryChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="flex-1 bg-zinc-750 border border-zinc-750 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold"
        />
        {rightAction}
        <button
          onClick={onSelectAll}
          disabled={loading || items.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-gray-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {allSelected ? <CheckSquare size={16} className="text-gold" /> : <Square size={16} />}
          Select All
        </button>
      </div>

      {loading ? (
        <div className="min-h-[50vh] flex items-center justify-center">
          <SpinnerSquare size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 border border-zinc-750 p-3 rounded-lg bg-zinc-800/40">
          {items.length === 0 && (
            <p className="text-sm text-gray-500 col-span-full text-center py-6">{emptyMessage}</p>
          )}
          {paginatedItems.map(item => {
            const id = getId(item);
            const selected = selectedIds.includes(id);
            return <div key={id}>{renderCard(item, selected)}</div>;
          })}
        </div>
      )}

      {!loading && items.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Showing {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, items.length)} of {items.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-400">{currentPage} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-2 border-t border-zinc-750">
        <span className="text-xs text-gray-500">{selectedIds.length} selected</span>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving || loading}
            className="px-4 py-2 bg-gold hover:bg-gold-hover text-black font-semibold rounded-lg transition-colors text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving && <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
