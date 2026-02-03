import * as React from 'react';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ExpandableSearch } from './ExpandableSearch';
import { cn } from '@/lib/utils';

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
}

function FilterBar({ filters, search }: { filters?: React.ReactNode; search?: SearchConfig }) {
  if (!filters && !search) return null;

  return (
    <div className="px-4 py-2 border-b flex items-center justify-between gap-4">
      <div className="overflow-x-auto flex-1 scrollbar-hide">
        <div className="min-w-fit">
          {filters}
        </div>
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
                <Skeleton
                  className={cn(
                    'h-4',
                    SKELETON_WIDTHS[(rowIndex + colIndex) % SKELETON_WIDTHS.length]
                  )}
                />
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
}: DataTableProps<T>) {
  if (loading) {
    return (
      <Card>
        <FilterBar filters={filters} search={search} />
        <TableSkeleton columns={columns as Column<unknown>[]} rows={skeletonRows} />
      </Card>
    );
  }

  if (data.length === 0 && emptyState) {
    return (
      <Card>
        <FilterBar filters={filters} search={search} />
        {emptyState}
      </Card>
    );
  }

  return (
    <Card>
      <FilterBar filters={filters} search={search} />
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
    </Card>
  );
}
