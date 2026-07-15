import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

interface Column<T> {
  key: keyof T | string;
  header: string;
  headerRender?: () => React.ReactNode;
  render?: (row: T) => React.ReactNode;
}

interface ServerPagination {
  page: number;
  limit: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[];
  actions?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  // When set, `data` is treated as already being the current page (fetched
  // from the server) — local slicing/pagination is skipped and page changes
  // are delegated to the caller instead of tracked in local state.
  serverPagination?: ServerPagination;
  // When set alongside serverPagination, the search box reports its value
  // here instead of filtering `data` locally (the server only holds one page).
  onSearchChange?: (search: string) => void;
  // Custom content to render on the left side of the search header (e.g., custom filters).
  leftHeaderContent?: React.ReactNode;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  searchPlaceholder = 'Search...',
  searchKeys,
  actions,
  onRowClick,
  serverPagination,
  onSearchChange,
  leftHeaderContent,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (serverPagination) {
      onSearchChange?.(value);
    } else {
      setPage(1);
    }
  };

  const filtered = useMemo(() => {
    if (serverPagination || !search) return data;
    return data.filter((row) => {
      const keys = searchKeys || (Object.keys(row) as (keyof T)[]);
      return keys.some((k) => {
        const val = row[k];
        return val != null && String(val).toLowerCase().includes(search.toLowerCase());
      });
    });
  }, [data, search, searchKeys, serverPagination]);

  const totalPages = serverPagination ? serverPagination.totalPages : Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = serverPagination ? serverPagination.page : page;
  const paginated = useMemo(
    () => (serverPagination ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize)),
    [filtered, serverPagination, page]
  );
  const totalCount = serverPagination ? serverPagination.total : filtered.length;
  const goToPage = (p: number) => {
    if (serverPagination) {
      serverPagination.onPageChange(p);
    } else {
      setPage(p);
    }
  };

  return (
    <div className="bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-zinc-750 flex items-center gap-3">
        {leftHeaderContent && (
          <div className="flex items-center gap-3 mr-auto">
            {leftHeaderContent}
          </div>
        )}
        <div className={`flex items-center gap-3 ${leftHeaderContent ? 'flex-1 max-w-sm' : 'flex-1'}`}>
          <Search size={18} className="text-gray-500 shrink-0" />
          <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="bg-transparent text-sm text-white placeholder-gray-500 outline-none flex-1 min-w-0"
        />
        </div>
      </div>

      {/* Desktop/tablet: the usual scrollable table. */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-750 bg-zinc-750/30">
              {columns.map((col) => (
                <th key={String(col.key)} className="text-left px-4 py-3 text-gray-400 font-medium uppercase tracking-wider text-xs">
                  {col.headerRender ? col.headerRender() : col.header}
                </th>
              ))}
              {actions && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {paginated.map((row, idx) => (
              <tr
                key={typeof row.id === 'string' || typeof row.id === 'number' ? row.id : idx}
                onClick={() => onRowClick && onRowClick(row)}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                onKeyDown={onRowClick ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick(row);
                  }
                } : undefined}
                className={`border-b border-zinc-750/50 transition-colors ${
                  onRowClick ? 'cursor-pointer hover:bg-gold/5 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-gold/50' : 'hover:bg-zinc-750/20'
                }`}
              >
                {columns.map((col) => (
                  <td key={String(col.key)} className="px-4 py-3 text-gray-300">
                    {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '-')}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {actions(row)}
                  </td>
                )}
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                  No records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: one stacked card per row instead of a horizontally-scrolling
          table — nothing gets clipped, and there's nothing to swipe sideways. */}
      <div className="md:hidden divide-y divide-zinc-750/50">
        {paginated.map((row, idx) => (
          <div
            key={typeof row.id === 'string' || typeof row.id === 'number' ? row.id : idx}
            onClick={() => onRowClick && onRowClick(row)}
            tabIndex={onRowClick ? 0 : undefined}
            role={onRowClick ? 'button' : undefined}
            onKeyDown={onRowClick ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onRowClick(row);
              }
            } : undefined}
            className={`p-4 space-y-2 transition-colors ${
              onRowClick ? 'cursor-pointer hover:bg-gold/5 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-gold/50' : ''
            }`}
          >
            {columns.map((col) => (
              <div key={String(col.key)} className="flex items-start justify-between gap-3">
                <span className="text-gray-500 text-xs uppercase tracking-wider shrink-0 pt-0.5">
                  {col.headerRender ? col.headerRender() : col.header}
                </span>
                <span className="text-gray-200 text-sm text-right min-w-0">
                  {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '-')}
                </span>
              </div>
            ))}
            {actions && (
              <div
                className="flex items-center justify-end gap-2 pt-2 mt-2 border-t border-zinc-800"
                onClick={(e) => e.stopPropagation()}
              >
                {actions(row)}
              </div>
            )}
          </div>
        ))}
        {paginated.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">No records found</div>
        )}
      </div>

      {(serverPagination ? serverPagination.totalPages > 1 : filtered.length > pageSize) && (
        <div className="p-4 border-t border-zinc-750 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {serverPagination
              ? `Showing ${(currentPage - 1) * serverPagination.limit + 1} - ${Math.min(currentPage * serverPagination.limit, totalCount)} of ${totalCount}`
              : `Showing ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, totalCount)} of ${totalCount}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm text-gray-400">{currentPage} / {totalPages}</span>
            <button
              onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
