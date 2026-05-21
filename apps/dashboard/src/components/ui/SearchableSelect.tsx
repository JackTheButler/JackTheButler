import { useEffect, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, Check, Search, Plus, X } from 'lucide-react';
import { cn } from './cn';
import { fieldBase } from './fieldStyles';

/**
 * Combobox primitive. Same visual shape as the plain `Select`, but opens a
 * searchable dropdown. Two opt-in behaviours:
 *
 *   - `creatable`: when the typed text matches no existing option, offer a
 *     "Create '<text>'" row — so it doubles as a free-text + suggestions
 *     field (e.g. KB topics, tags). The chosen value can be a string that
 *     isn't in `options`.
 *   - `clearable`: show a row that clears the selection (`''`) — for optional
 *     fields.
 *
 * Keyboard: ↑/↓ move the highlight, Enter selects the active row, Escape
 * closes, click-outside closes.
 *
 * The dropdown is a Radix Popover: portaled to the body (never clipped
 * inside a Dialog/drawer) and collision-aware (auto-flips above the trigger
 * when there's no room below, shifts to stay on screen). We render our own
 * search input + row list inside the popover content.
 */

export interface SearchableSelectOption {
  value: string;
  label: string;
}

type Row =
  | { kind: 'clear'; value: ''; label: string }
  | { kind: 'option'; value: string; label: string }
  | { kind: 'create'; value: string; label: string };

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  creatable = false,
  clearable = false,
  clearLabel = 'No selection',
  className,
  'aria-label': ariaLabel,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  options: readonly SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Offer "Create '<typed>'" when the text matches no option. */
  creatable?: boolean;
  /** Offer a row that clears the selection (sets `''`). */
  clearable?: boolean;
  clearLabel?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Unified, keyboard-navigable row list: [clear?] + options + [create?].
  const rows = useMemo<Row[]>(() => {
    const q = query.trim();
    const exact = options.some(
      (o) =>
        o.value.toLowerCase() === q.toLowerCase() || o.label.toLowerCase() === q.toLowerCase(),
    );
    const out: Row[] = [];
    if (clearable && value) out.push({ kind: 'clear', value: '', label: clearLabel });
    for (const o of filtered) out.push({ kind: 'option', value: o.value, label: o.label });
    if (creatable && q.length > 0 && !exact) {
      out.push({ kind: 'create', value: q, label: `Create “${q}”` });
    }
    return out;
  }, [filtered, options, query, value, creatable, clearable, clearLabel]);

  // Value may be a created string that isn't in `options` — show it as-is.
  const current = options.find((o) => o.value === value);
  const display = current?.label ?? value ?? '';

  // Radix Popover handles click-outside + Escape close. Just reset query +
  // highlight when (re)opening.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const select = (v: string) => {
    onValueChange?.(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[activeIndex];
      if (row) select(row.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            fieldBase,
            'flex w-full items-center justify-between gap-2 text-left',
            !value && 'text-muted',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {value ? <span className="text-ink">{display}</span> : placeholder}
          </span>
          <ChevronDown size={15} className="shrink-0 text-muted" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          // Match the trigger's width; flip/shift are automatic.
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border border-line bg-panel shadow-lg data-[state=open]:animate-[fade-in_120ms_ease-out]"
          // Keep focus on our search input rather than the first row.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={14} className="shrink-0 text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <div
            ref={listRef}
            role="listbox"
            className="max-h-[min(16rem,var(--radix-popover-content-available-height))] overflow-y-auto p-1"
          >
            {rows.length === 0 ? (
              <div className="px-2.5 py-2 text-sm text-muted">{emptyText}</div>
            ) : (
              rows.map((row, i) => {
                const isActive = i === activeIndex;
                const isSelected = row.kind === 'option' && row.value === value;
                return (
                  <button
                    key={`${row.kind}:${row.value}:${i}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => select(row.value)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none transition-colors',
                      isActive && 'bg-surface',
                      isSelected && 'font-medium',
                      row.kind !== 'option' && 'text-muted',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {row.kind === 'create' && <Plus size={13} className="shrink-0" />}
                      {row.kind === 'clear' && <X size={13} className="shrink-0" />}
                      <span className="truncate">{row.label}</span>
                    </span>
                    {isSelected && <Check size={14} className="shrink-0 text-accent" />}
                  </button>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
