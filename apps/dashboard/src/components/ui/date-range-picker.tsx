import * as React from 'react';
import { format } from 'date-fns';
import { CalendarIcon, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface DateRangePickerProps {
  from: string;  // 'YYYY-MM-DD' or ''
  to: string;
  onChange: (from: string, to: string) => void;
  className?: string;
}

function parseDate(s: string): Date | undefined {
  return s ? new Date(s + 'T00:00:00') : undefined;
}

export function DateRangePicker({ from, to, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DateRange | undefined>(undefined);

  // On open: show committed range as context.
  // On close without completing: just close (don't clear committed values).
  function handleOpenChange(next: boolean) {
    if (next) {
      const f = parseDate(from);
      const t = parseDate(to);
      setDraft(f || t ? { from: f, to: t } : undefined);
    }
    setOpen(next);
  }

  // onSelect receives (range, selectedDay) — selectedDay is the actual clicked date.
  // When a full range is already shown and the user clicks, we treat it as starting
  // a new selection anchored at selectedDay (avoids RDP completing a range on first click).
  function handleSelect(range: DateRange | undefined, selectedDay: Date) {
    const hadFullRange = draft?.from != null && draft?.to != null;

    if (hadFullRange) {
      // First click on a new selection — start fresh from the clicked day
      setDraft({ from: selectedDay, to: undefined });
      return;
    }

    setDraft(range);

    if (range?.from && range?.to) {
      onChange(format(range.from, 'yyyy-MM-dd'), format(range.to, 'yyyy-MM-dd'));
      setOpen(false);
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(undefined);
    onChange('', '');
  }

  const hasValue = from !== '' || to !== '';

  const label = React.useMemo(() => {
    if (from && to) return `${format(new Date(from + 'T00:00:00'), 'MMM d')} – ${format(new Date(to + 'T00:00:00'), 'MMM d')}`;
    if (from)       return `From ${format(new Date(from + 'T00:00:00'), 'MMM d')}`;
    if (to)         return `Until ${format(new Date(to + 'T00:00:00'), 'MMM d')}`;
    return 'Date range';
  }, [from, to]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className={cn(
            'h-7 gap-1.5 border-input px-2 text-xs font-normal',
            hasValue ? 'text-foreground' : 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          <span>{label}</span>
          {hasValue && (
            <span
              role="button"
              tabIndex={0}
              className="ml-0.5 rounded-sm opacity-70 hover:opacity-100 focus:outline-none"
              onClick={handleClear}
              onKeyDown={(e) => e.key === 'Enter' && handleClear(e as unknown as React.MouseEvent)}
            >
              <X className="h-3 w-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={parseDate(from) ?? new Date()}
          selected={draft}
          onSelect={handleSelect}
          numberOfMonths={2}
          disabled={(date) => date > new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}
