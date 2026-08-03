import { useEffect, useMemo, useRef, useState, useContext } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, Download, Inbox, X } from 'lucide-react';
import { exportToCSV } from '../lib/csvExport';
import { AuthContext } from '../context/AuthContext';

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
  limitOptions?: number[];
  onLimitChange?: (limit: number) => void;
  autoFit?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchPlaceholder?: string;
  searchKeys?: (keyof T)[];
  actions?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  serverPagination?: ServerPagination;
  onSearchChange?: (search: string) => void;
  leftHeaderContent?: React.ReactNode;
  pageSizeOptions?: number[];
  exportFilename?: string;
  hideExport?: boolean;
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
  pageSizeOptions,
  exportFilename = 'export_data',
  hideExport = false,
}: DataTableProps<T>) {
  const auth = useContext(AuthContext);
  const isAdmin = auth?.user?.role === 'admin';
  const showExportButton = !hideExport && isAdmin;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(pageSizeOptions?.[0] ?? 12);
  const pageSize = localPageSize;
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  const handleFitToViewport = () => {
    if (!serverPagination?.onLimitChange) return;
    const firstRow = tbodyRef.current?.querySelector('tr');
    if (!firstRow) return;
    const rowHeight = firstRow.getBoundingClientRect().height;
    if (!rowHeight) return;
    const tbodyTop = firstRow.getBoundingClientRect().top;
    const footerHeight = footerRef.current?.getBoundingClientRect().height ?? 60;
    const available = window.innerHeight - tbodyTop - footerHeight - 16;
    const count = Math.max(5, Math.floor(available / rowHeight));
    serverPagination.onLimitChange(count);
  };

  const hasAutoFitted = useRef(false);
  useEffect(() => {
    if (serverPagination?.autoFit && !hasAutoFitted.current && data.length > 0) {
      hasAutoFitted.current = true;
      handleFitToViewport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPagination?.autoFit, data]);

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
    [filtered, serverPagination, page, pageSize]
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
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-zinc-750 flex items-center gap-3 shrink-0">
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
          {search && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="text-gray-500 hover:text-white p-0.5 rounded transition-colors shrink-0"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>
        {showExportButton && (
          <button
            onClick={() => {
              const exportCols = columns.map(c => ({
                key: String(c.key),
                header: c.header,
              }));
              exportToCSV(exportFilename, filtered, exportCols);
            }}
            title="Export CSV"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-750 hover:bg-zinc-700 text-gold border border-zinc-700 rounded-lg transition-colors shrink-0"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        )}
      </div>

      {/* Desktop/tablet: standard scrollable table */}
      <div
        ref={tableWrapRef}
        className="hidden md:block flex-1 min-h-0 overflow-auto w-full scrollbar-thin"
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-750">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className="sticky top-0 z-10 bg-zinc-800 text-left px-4 py-3 text-gray-400 font-medium uppercase tracking-wider text-xs"
                >
                  {col.headerRender ? col.headerRender() : col.header}
                </th>
              ))}
              {actions && <th className="sticky top-0 z-10 bg-zinc-800 px-4 py-3" />}
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
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
                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-16 text-center text-gray-500">
                  <div className="flex flex-col items-center justify-center gap-2 max-w-xs mx-auto">
                    <div className="p-3 bg-zinc-800 rounded-full text-gold/80 border border-zinc-750">
                      <Inbox size={32} />
                    </div>
                    <p className="text-sm font-semibold text-white">No records found</p>
                    <p className="text-xs text-gray-400">
                      {search ? `No items match "${search}"` : 'There are no records available in this view.'}
                    </p>
                    {search && (
                      <button
                        type="button"
                        onClick={() => handleSearchChange('')}
                        className="mt-2 text-xs font-semibold px-3 py-1.5 bg-zinc-750 text-gold rounded-lg hover:bg-zinc-700 transition-colors"
                      >
                        Clear Search
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="md:hidden flex-1 min-h-0 overflow-auto divide-y divide-zinc-750/50 w-full scrollbar-thin">
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
          <div className="px-4 py-16 text-center text-gray-500 flex flex-col items-center justify-center gap-2 max-w-xs mx-auto">
            <div className="p-3 bg-zinc-800 rounded-full text-gold/80 border border-zinc-750">
              <Inbox size={32} />
            </div>
            <p className="text-sm font-semibold text-white">No records found</p>
            <p className="text-xs text-gray-400">
              {search ? `No items match "${search}"` : 'There are no records available in this view.'}
            </p>
            {search && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="mt-2 text-xs font-semibold px-3 py-1.5 bg-zinc-750 text-gold rounded-lg hover:bg-zinc-700 transition-colors"
              >
                Clear Search
              </button>
            )}
          </div>
        )}
      </div>

      {(serverPagination ? serverPagination.totalPages > 1 : filtered.length > pageSize) && (
        <div ref={footerRef} className="p-4 border-t border-zinc-750 flex items-center justify-between flex-wrap gap-3 shrink-0 mt-auto">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {serverPagination
                ? `Showing ${(currentPage - 1) * serverPagination.limit + 1} - ${Math.min(currentPage * serverPagination.limit, totalCount)} of ${totalCount}`
                : `Showing ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, totalCount)} of ${totalCount}`}
            </span>
            {(serverPagination?.limitOptions ?? (!serverPagination ? pageSizeOptions : undefined)) && (
              <div className="flex items-center gap-1">
                {(serverPagination?.limitOptions ?? pageSizeOptions ?? []).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      if (serverPagination?.onLimitChange) {
                        serverPagination.onLimitChange(opt);
                      } else {
                        setLocalPageSize(opt);
                        setPage(1);
                      }
                    }}
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${
                      opt === (serverPagination ? serverPagination.limit : localPageSize)
                        ? 'bg-gold/20 text-gold font-semibold'
                        : 'text-gray-400 hover:text-white hover:bg-zinc-750'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
            >
              <ChevronsLeft size={16} />
            </button>
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
            <button
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-zinc-750 disabled:opacity-30 transition-colors"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
