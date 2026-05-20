import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from './cn';
import { fieldBase } from './fieldStyles';

/**
 * Combobox-style select for long option lists. Same visual shape as the
 * plain `Select` primitive (so they sit consistently in forms), but the
 * dropdown opens with a search input that filters items by both label
 * and value. Use this when the option list exceeds ~10 items or covers
 * a domain where typeahead helps (languages, countries, customers…).
 *
 * Keyboard model:
 *   - ↑/↓ moves the active highlight
 *   - Enter selects the active item
 *   - Escape closes
 *   - Click-outside closes
 *
 * Not portaled — the dropdown sits absolutely under the trigger inside
 * the form. Forms in this app don't use clipping `overflow:hidden` on
 * the field wrapper, so this is fine. If we ever need this inside a
 * scrolled drawer, swap the floating panel for a Radix Popover portal.
 */

export interface SearchableSelectOption {
  value: string;
  label: string;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  className,
  'aria-label': ariaLabel,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  options: readonly SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const current = options.find((o) => o.value === value);

  // Click-outside closes the panel.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // On open: clear the query, highlight the current value (or first item),
  // focus the search input.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const idx = options.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    // Defer focus so the input is mounted.
    queueMicrotask(() => inputRef.current?.focus());
  }, [open, options, value]);

  // Keep active highlight visible as the user navigates.
  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  // Reset highlight to the top whenever the filter changes (typing).
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
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt) select(opt.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          fieldBase,
          'flex w-full items-center justify-between gap-2 text-left',
          !current && 'text-muted',
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {current ? <span className="text-ink">{current.label}</span> : placeholder}
        </span>
        <ChevronDown size={15} className="shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-line bg-panel shadow-lg animate-[fade-in_120ms_ease-out]">
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
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-2 text-sm text-muted">{emptyText}</div>
            ) : (
              filtered.map((opt, i) => {
                const isActive = i === activeIndex;
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => select(opt.value)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none transition-colors',
                      isActive && 'bg-surface',
                      isSelected && 'font-medium',
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check size={14} className="shrink-0 text-accent" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
