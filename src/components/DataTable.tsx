import { useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, Download, Inbox, X, Maximize2, Minimize2 } from 'lucide-react';
import { exportToCSV } from '../lib/csvExport';
import { BASE_PAGE_SIZE, derivePageSizeOptions } from '../lib/pageSize';
import SpinnerSquare from './SpinnerSquare';
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
  /**
   * Shows a spinner over the rows without unmounting the table.
   *
   * Callers used to swap the whole table out for a spinner while fetching,
   * which threw away everything the table holds — most visibly the expanded
   * state, so changing page or page size while full screen collapsed it.
   */
  loading?: boolean;
  /**
   * Optional controlled full-screen state.
   *
   * Left out, the table owns it — which is right until the caller renders
   * something *else* in place of the table, like a detail view for the row you
   * clicked. The table unmounts then, taking its own state with it, and the
   * detail opens at normal size after you had asked for the whole screen. A
   * caller that can replace the table has to own the flag.
   */
  fullscreen?: boolean;
  onFullscreenChange?: (open: boolean) => void;
}

// `object`, not `Record<string, unknown>`: nothing here needs an index
// signature, only `keyof T` access, which works on any object type. The
// stricter constraint turned away perfectly ordinary interfaces — a caller
// had to widen its own domain type just to render it in a table, which is the
// table's problem leaking into the data model.
/**
 * A stable React key for a row: its `id` when it has a usable one, otherwise
 * its index. Rows are not required to carry an id — the table renders whatever
 * it is given — so this reads the field defensively rather than the type
 * demanding it.
 */
function rowKey(row: object, index: number): string | number {
  const id = (row as { id?: unknown }).id;
  return typeof id === 'string' || typeof id === 'number' ? id : index;
}

export default function DataTable<T extends object>({
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
  loading = false,
  fullscreen,
  onFullscreenChange,
}: DataTableProps<T>) {
  const auth = useContext(AuthContext);
  const isAdmin = auth?.user?.role === 'admin';
  const showExportButton = !hideExport && isAdmin;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Tables sit under a page header, filters and often a dropdown or two, so
  // what is left for rows is a fraction of the screen. This hands the whole
  // viewport over when someone asks for it.
  //
  // Asked for, not inferred: entering on scroll was considered and rejected.
  // Scrolling is the most casual interaction there is — a nudge of the wheel
  // to see one more row would take over the display, and the same gesture
  // couldn't undo it. Wanting more room is a decision, so it gets a button.
  const [uncontrolledFullscreen, setUncontrolledFullscreen] = useState(false);
  const isFullscreen = fullscreen ?? uncontrolledFullscreen;
  const setIsFullscreen = useCallback(
    (next: boolean) => {
      if (fullscreen === undefined) setUncontrolledFullscreen(next);
      onFullscreenChange?.(next);
    },
    [fullscreen, onFullscreenChange]
  );
  // Falls back to the same base the derived choices start from, so the size
  // actually in use is one of the buttons offered. It used to default to 12
  // against a list starting at 20, which left every client-paginated table
  // showing a row count none of its own buttons was highlighting.
  const [localPageSize, setLocalPageSize] = useState(pageSizeOptions?.[0] ?? BASE_PAGE_SIZE);
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

  // Re-fit when the window changes size. Fitting once on mount left a table
  // sized for whatever the viewport was then — maximise the window and the
  // extra height stays empty, which is the same complaint the expand button
  // exists to answer. Debounced, since resize fires continuously and each fit
  // asks the server for a new page.
  useEffect(() => {
    if (!serverPagination?.autoFit) return;
    let timer: number;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(handleFitToViewport, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPagination?.autoFit]);

  // Escape is what people try first to leave anything covering the screen,
  // and the listener only exists while it is covering the screen — otherwise
  // every table on the page would be swallowing Escape from modals above it.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    // The page behind must not scroll under the overlay — restored on exit,
    // including when the component unmounts while still expanded.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
    // setIsFullscreen is stable (useCallback) and included so the listener
    // never closes over a stale controlled setter.
  }, [isFullscreen, setIsFullscreen]);

  // Expanding roughly doubles the room for rows, so a table that sized its
  // page to the viewport should ask for that many again — otherwise the whole
  // screen shows the twelve rows that fitted the old one.
  useEffect(() => {
    if (!serverPagination?.autoFit) return;
    const timer = window.setTimeout(handleFitToViewport, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

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
  // A caller's own list still wins — a table that genuinely needs fixed
  // choices can say so — but not supplying one is now the normal case, and
  // gets choices that fit the data instead of a number somebody typed once.
  const sizeOptions = useMemo(
    () => serverPagination?.limitOptions ?? pageSizeOptions ?? derivePageSizeOptions(totalCount),
    [serverPagination?.limitOptions, pageSizeOptions, totalCount]
  );
  const goToPage = (p: number) => {
    if (serverPagination) {
      serverPagination.onPageChange(p);
    } else {
      setPage(p);
    }
  };

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[120] flex flex-col bg-zinc-850 border-0 rounded-none overflow-hidden'
          : 'relative flex-1 min-h-0 flex flex-col bg-zinc-850 border border-zinc-750 rounded-xl overflow-hidden shadow-sm'
      }
    >
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
              // exportToCSV still wants the indexable form; it reads rows by
              // the string keys the columns name, which every object supports
              // at runtime.
              exportToCSV(exportFilename, filtered as unknown as Record<string, unknown>[], exportCols);
            }}
            title="Export CSV"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-750 hover:bg-zinc-700 text-gold border border-zinc-700 rounded-lg transition-colors shrink-0"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setIsFullscreen(!isFullscreen)}
          title={isFullscreen ? 'Exit full screen (Esc)' : 'Expand to full screen'}
          aria-label={isFullscreen ? 'Exit full screen' : 'Expand to full screen'}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gold hover:bg-zinc-750 transition-colors shrink-0"
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Dimmed with a spinner rather than replaced: the rows on screen are
          the previous page, which is a better thing to look at for the moment
          a fetch takes than an empty table — and nothing gets remounted. */}
      {loading && (
        <div className="absolute inset-0 top-16 z-10 flex items-center justify-center bg-zinc-850/60 pointer-events-none">
          <SpinnerSquare size={36} />
        </div>
      )}

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
                key={rowKey(row, idx)}
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
            key={rowKey(row, idx)}
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
            {sizeOptions.length > 0 && (
              <div className="flex items-center gap-1">
                {sizeOptions.map((opt) => (
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
                    {/* The largest choice is the whole table, so it says so —
                        a bare row count reads as one more arbitrary number. */}
                    {opt === totalCount ? 'All' : opt}
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
