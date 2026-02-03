import { Badge, BadgeVariant } from '@/components/ui/badge';
import { formatDate, formatDateTime } from '@/lib/formatters';
import type { Column } from '../DataTable';

/**
 * Create a status column with a Badge.
 *
 * @example
 * createStatusColumn<Task>({
 *   key: 'status',
 *   header: 'Status',
 *   variants: taskStatusVariants,
 *   getValue: (task) => task.status,
 * })
 */
export function createStatusColumn<T>({
  key,
  header,
  variants,
  getValue,
  formatLabel = (value) => value.replace(/_/g, ' '),
}: {
  key: string;
  header: string;
  variants: Record<string, BadgeVariant>;
  getValue: (row: T) => string;
  formatLabel?: (value: string) => string;
}): Column<T> {
  return {
    key,
    header,
    render: (row) => {
      const value = getValue(row);
      return (
        <Badge variant={variants[value] || 'default'} className="capitalize">
          {formatLabel(value)}
        </Badge>
      );
    },
  };
}

/**
 * Create a date column with formatted date.
 *
 * @example
 * createDateColumn<Reservation>({
 *   key: 'arrivalDate',
 *   header: 'Arrival',
 *   getValue: (res) => res.arrivalDate,
 * })
 */
export function createDateColumn<T>({
  key,
  header,
  getValue,
  format = 'date',
}: {
  key: string;
  header: string;
  getValue: (row: T) => string | null;
  format?: 'date' | 'datetime';
}): Column<T> {
  const formatter = format === 'datetime' ? formatDateTime : formatDate;
  return {
    key,
    header,
    render: (row) => {
      const value = getValue(row);
      return (
        <span className="text-sm">
          {value ? formatter(value) : '-'}
        </span>
      );
    },
  };
}

/**
 * Create a text column with optional truncation.
 *
 * @example
 * createTextColumn<Task>({
 *   key: 'description',
 *   header: 'Description',
 *   getValue: (task) => task.description,
 *   maxLength: 50,
 * })
 */
export function createTextColumn<T>({
  key,
  header,
  getValue,
  maxLength,
  className,
}: {
  key: string;
  header: string;
  getValue: (row: T) => string | null;
  maxLength?: number;
  className?: string;
}): Column<T> {
  return {
    key,
    header,
    className,
    render: (row) => {
      const value = getValue(row) || '-';
      const displayValue = maxLength && value.length > maxLength
        ? `${value.slice(0, maxLength)}...`
        : value;
      return <span className="text-sm">{displayValue}</span>;
    },
  };
}

/**
 * Create an actions column (typically for chevron or menu).
 *
 * @example
 * createActionsColumn<Guest>({
 *   render: (guest) => <ChevronRight className="w-4 h-4" />,
 * })
 */
export function createActionsColumn<T>({
  render,
  className = 'w-12',
}: {
  render: (row: T) => React.ReactNode;
  className?: string;
}): Column<T> {
  return {
    key: 'actions',
    header: '',
    className,
    render,
  };
}
