import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        months:             'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month:              'space-y-4',
        caption:            'flex justify-center pt-1 relative items-center',
        caption_label:      'text-sm font-medium',
        nav:                'space-x-1 flex items-center',
        nav_button:         cn(buttonVariants({ variant: 'outline' }), 'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100'),
        nav_button_previous:'absolute left-1',
        nav_button_next:    'absolute right-1',
        table:              'w-full border-collapse space-y-1',
        head_row:           'flex',
        head_cell:          'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
        row:                'flex w-full mt-2',
        // td — full-width primary strip for range cells
        cell: cn(
          'relative h-9 w-9 p-0 text-center text-sm',
          '[&:has(.day-range-middle)]:bg-primary',
          '[&:has(.day-range-start)]:rounded-l-md [&:has(.day-range-start)]:bg-primary',
          '[&:has(.day-range-end)]:rounded-r-md   [&:has(.day-range-end)]:bg-primary',
          'focus-within:relative focus-within:z-20'
        ),
        // base day button
        day: cn(buttonVariants({ variant: 'ghost' }), 'h-9 w-9 p-0 font-normal'),
        // range endpoints — solid primary circle
        day_selected:     'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        day_range_start:  'day-range-start rounded-full',
        day_range_end:    'day-range-end rounded-full',
        // middle days — transparent so the cell primary shows through
        day_range_middle: 'day-range-middle rounded-none bg-transparent text-primary-foreground hover:bg-transparent hover:text-primary-foreground',
        day_today:        'font-semibold underline',
        day_outside:      'text-muted-foreground opacity-50',
        day_disabled:     'text-muted-foreground opacity-50 cursor-not-allowed',
        day_hidden:       'invisible',
        ...classNames,
      }}
      components={{
        IconLeft:  () => <ChevronLeft  className="h-4 w-4" />,
        IconRight: () => <ChevronRight className="h-4 w-4" />,
      }}
      {...props}
    />
  );
}

Calendar.displayName = 'Calendar';

export { Calendar };
