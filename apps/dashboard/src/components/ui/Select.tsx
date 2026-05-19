import * as RadixSelect from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from './cn';
import { fieldBase } from './fieldStyles';

/**
 * Styled select (Radix — fully themed dropdown, keyboard/aria for free).
 * Native <select> can't style its option list; this can.
 * Usage: <Select …><SelectItem value="x">X</SelectItem></Select>
 */
export function Select({
  value,
  defaultValue,
  onValueChange,
  placeholder,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  children: React.ReactNode;
  'aria-label'?: string;
}) {
  return (
    <RadixSelect.Root value={value} defaultValue={defaultValue} onValueChange={onValueChange}>
      <RadixSelect.Trigger
        aria-label={ariaLabel}
        className={cn(
          fieldBase,
          'flex items-center justify-between gap-2 data-[placeholder]:text-muted',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <ChevronDown size={15} className="text-muted" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-lg data-[state=open]:animate-[fade-in_120ms_ease-out]"
        >
          <RadixSelect.Viewport>{children}</RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <RadixSelect.Item
      value={value}
      className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-surface data-[state=checked]:font-medium"
    >
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
      <RadixSelect.ItemIndicator>
        <Check size={14} className="text-accent" />
      </RadixSelect.ItemIndicator>
    </RadixSelect.Item>
  );
}
