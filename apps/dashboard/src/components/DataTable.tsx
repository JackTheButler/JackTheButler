import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ExpandableSearch } from './shared/ExpandableSearch';
import { cn } from '@/lib/utils';

const TABLE_CARD_CLASS = 'relative rounded-2xl border border-white/50 bg-white/60 backdrop-blur-lg text-card-foreground shadow-lg shadow-black/[0.1] dark:bg-black/30 dark:border-white/10 dark:shadow-black/[0.4] glass-noise';

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

export interface SearchConfig {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onClear?: () => void;
  placeholder?: string;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string;
  filters?: React.ReactNode;
  search?: SearchConfig;
  emptyState?: React.ReactNode;
  loading?: boolean;
  /** Number of skeleton rows to show when loading (default: 5) */
  skeletonRows?: number;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | undefined;
  pagination?: PaginationConfig;
}

function FilterBar({ filters, search }: { filters?: React.ReactNode; search?: SearchConfig }) {
  if (!filters && !search) return null;
  return (
    <div className="px-4 py-2 border-b flex items-center justify-between gap-4">
      <div className="overflow-x-auto flex-1 scrollbar-hide">
        <div className="min-w-fit">{filters}</div>
      </div>
      {search && (
        <ExpandableSearch
          value={search.value}
          onChange={search.onChange}
          onSearch={search.onSearch}
          onClear={search.onClear}
          placeholder={search.placeholder}
        />
      )}
    </div>
  );
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function TablePager({ pagination }: { pagination: PaginationConfig }) {
  const { page, pageSize, total, pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS, onPageChange, onPageSizeChange } = pagination;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [inputValue, setInputValue] = React.useState(String(page));
  const [stuck, setStuck] = React.useState(false);
  const sentinelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => { setInputValue(String(page)); }, [page]);

  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting), { threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const commit = () => {
    const n = parseInt(inputValue, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onPageChange(n);
    } else {
      setInputValue(String(page));
    }
  };

  return (
    <>
    <div className={cn('sticky bottom-0 z-10 border-t px-4 py-2 flex items-center justify-between bg-white dark:bg-zinc-950', !stuck && 'rounded-b-2xl')}>
      {onPageSizeChange ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-[70px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">{total.toLocaleString()} total</span>
      )}
      <div className="inline-flex items-center rounded-md border overflow-hidden">
        <button
          className="h-8 w-8 flex items-center justify-center border-r text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-40"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1.5 px-3">
          <input
            className="w-8 h-6 text-center text-sm tabular-nums bg-muted rounded focus:outline-none focus:ring-1 focus:ring-ring"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setInputValue(String(page)); }}
          />
          <span className="text-sm text-muted-foreground">/ {totalPages}</span>
        </div>
        <button
          className="h-8 w-8 flex items-center justify-center border-l text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-40"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
    <div ref={sentinelRef} />
    </>
  );
}

/** Skeleton widths to vary row appearance */
const SKELETON_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-4/5', 'w-1/3'];

function TableSkeleton({ columns, rows }: { columns: Column<unknown>[]; rows: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/50 hover:bg-muted/50">
          {columns.map((column) => (
            <TableHead key={column.key} className={cn('px-4', column.className)}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {columns.map((column, colIndex) => (
              <TableCell key={column.key} className={cn('px-4', column.className)}>
                <Skeleton className={cn('h-4', SKELETON_WIDTHS[(rowIndex + colIndex) % SKELETON_WIDTHS.length])} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  filters,
  search,
  emptyState,
  loading,
  skeletonRows = 5,
  onRowClick,
  rowClassName,
  pagination,
}: DataTableProps<T>) {
  const scrollRef       = React.useRef<HTMLDivElement>(null);
  const stickyScrollRef = React.useRef<HTMLDivElement>(null);
  const stickyTableRef  = React.useRef<HTMLTableElement>(null);
  const realTheadRef    = React.useRef<HTMLTableSectionElement>(null);

  const columnKeys = columns.map((c) => c.key).join(',');

  React.useEffect(() => {
    const scroll       = scrollRef.current;
    const stickyScroll = stickyScrollRef.current;
    const stickyTable  = stickyTableRef.current;
    const realThead    = realTheadRef.current;
    if (!scroll || !stickyScroll || !stickyTable || !realThead) return;

    const onScroll = () => { stickyScroll.scrollLeft = scroll.scrollLeft; };
    scroll.addEventListener('scroll', onScroll, { passive: true });

    const syncWidths = () => {
      const realTable = realThead.closest<HTMLTableElement>('table');
      if (!realTable) return;
      const realThs   = Array.from(realThead.querySelectorAll<HTMLElement>('th'));
      const stickyThs = Array.from(stickyTable.querySelectorAll<HTMLElement>('th'));
      realThs.forEach((th, i) => {
        if (stickyThs[i]) stickyThs[i].style.width = `${th.offsetWidth}px`;
      });
      stickyTable.style.width  = `${realTable.offsetWidth}px`;
      scroll.style.marginTop   = `-${realThead.offsetHeight}px`;
    };

    syncWidths();
    const ro = new ResizeObserver(syncWidths);
    ro.observe(realThead);

    const tbody = realThead.closest('table')?.querySelector('tbody') ?? null;
    const mo = tbody ? new MutationObserver(syncWidths) : null;
    mo?.observe(tbody!, { childList: true });

    return () => {
      scroll.removeEventListener('scroll', onScroll);
      ro.disconnect();
      mo?.disconnect();
    };
  }, [columnKeys]);

  if (loading) {
    return (
      <div className={TABLE_CARD_CLASS}>
        <FilterBar filters={filters} search={search} />
        <div className="overflow-x-auto">
          <TableSkeleton columns={columns as Column<unknown>[]} rows={skeletonRows} />
        </div>
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return (
      <div className={TABLE_CARD_CLASS}>
        <FilterBar filters={filters} search={search} />
        {emptyState}
      </div>
    );
  }

  return (
    <div className={TABLE_CARD_CLASS}>
      <FilterBar filters={filters} search={search} />

      {/* Sticky duplicate header — sits outside the scroll div so position:sticky works */}
      <div
        ref={stickyScrollRef}
        className="sticky top-0 z-10 overflow-hidden bg-white dark:bg-zinc-950 border-b"
      >
        <table
          ref={stickyTableRef}
          style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}
        >
          <thead>
            <tr className="bg-muted/50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn('h-10 px-4 text-left align-middle text-sm font-medium text-muted-foreground', column.className)}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>

      {/* Real table — scrolls horizontally; thead is invisible but holds column widths */}
      <div ref={scrollRef} className="overflow-x-auto">
        <Table>
          <thead ref={realTheadRef} className="invisible">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={cn('h-10 px-4', column.className)}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <TableBody>
            {data.map((row) => (
              <TableRow
                key={keyExtractor(row)}
                className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((column) => (
                  <TableCell key={column.key} className={cn('px-4', column.className)}>
                    {column.render
                      ? column.render(row)
                      : (row as Record<string, unknown>)[column.key] as React.ReactNode}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination && <TablePager pagination={pagination} />}
    </div>
  );
}
