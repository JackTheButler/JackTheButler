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
import { Spinner } from '@/components/ui/spinner';
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
  loadingState?: React.ReactNode;
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

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  filters,
  search,
  emptyState,
  loading,
  loadingState,
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <Card>
        <FilterBar filters={filters} search={search} />
        {loadingState || (
          <div className="flex items-center justify-center py-12">
            <Spinner size="lg" />
          </div>
        )}
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
