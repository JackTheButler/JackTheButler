import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Select, SelectItem } from '@/components/ui';

/**
 * List-footer row: a "from–to of total" range, an optional page-size selector,
 * and prev/next controls. A page-composition piece (sits alongside PageHeader
 * / Toolbar, above the ui primitives), not a generic primitive. Page is
 * 1-based and controlled by the caller. Renders nothing when even the smallest
 * page size fits everything on one page.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  pageSizeOptions,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  /** When provided (with `onPageSize`), shows a "Per page" dropdown. */
  pageSizeOptions?: readonly number[];
  onPageSize?: (size: number) => void;
}) {
  const minSize = pageSizeOptions?.length ? Math.min(...pageSizeOptions) : pageSize;
  if (total <= minSize) return null;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const showSizer = pageSizeOptions && pageSizeOptions.length > 0 && onPageSize;

  return (
    <div className="flex items-center justify-between gap-2 pt-1">
      {/* One position indicator — the range conveys both window and total, so
          there's no separate "Page X of Y". */}
      <span className="text-xs text-muted">
        {from}–{to} of {total}
      </span>

      {/* One control cluster: page-size selector + prev/next together. */}
      <div className="flex items-center gap-2">
        {showSizer && (
          // Hidden only on the narrowest screens (below xxs / 360px) to keep the
          // footer on one tidy row; prev/next remain.
          <div className="hidden xxs:block">
            <Select
              aria-label="Rows per page"
              // Match the sm pager buttons (h-8 / text-xs) — the field default
              // (py-2 / text-sm) renders taller than them. Label lives in the
              // options ("20 per page") so there's no separate caption.
              className="h-8 w-[7.5rem] py-0 text-xs"
              value={String(pageSize)}
              onValueChange={(v) => onPageSize(Number(v))}
            >
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} per page
                </SelectItem>
              ))}
            </Select>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft size={15} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => onPage(page + 1)}
          >
            <ChevronRight size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}
