import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import { cn } from './cn';

/** Dropdown menu (Radix — keyboard nav, focus, aria for free). */
export const DropdownMenu = RadixMenu.Root;
export const DropdownMenuTrigger = RadixMenu.Trigger;

export function DropdownMenuContent({
  children,
  align = 'end',
  className,
}: {
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-[10rem] overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-lg focus:outline-none',
          'data-[state=open]:animate-[fade-in_120ms_ease-out]',
          className,
        )}
      >
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  destructive,
}: {
  children: React.ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
}) {
  return (
    <RadixMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none transition-colors',
        'data-[highlighted]:bg-surface',
        destructive ? 'text-red-600' : 'text-ink',
      )}
    >
      {children}
    </RadixMenu.Item>
  );
}

export function DropdownMenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-line" />;
}
