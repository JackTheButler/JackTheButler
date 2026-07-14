import { MoreVertical } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  cn,
} from '@/components/ui';

/**
 * Action-list row: leading slot (avatar/icon) · content · optional status ·
 * optional trailing (usually a RowMenu). Shared by Knowledge & Team.
 * (Composition tier — sits next to PageHeader, not in components/ui.)
 */
export function ListRow({
  leading,
  children,
  status,
  trailing,
  disabled,
}: {
  leading: React.ReactNode;
  children: React.ReactNode;
  status?: React.ReactNode;
  trailing?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-line px-3 py-3 last:border-b-0 md:px-4',
        disabled && 'opacity-60',
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">{children}</div>
      {status}
      {trailing}
    </div>
  );
}

/** The recurring ⋯ actions menu used in list rows. Children = menu items. */
export function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Actions">
          <MoreVertical size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}
