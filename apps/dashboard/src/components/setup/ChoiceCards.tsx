import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CardChoice {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  recommended?: boolean;
}

interface ChoiceCardsProps {
  choices: CardChoice[];
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export function ChoiceCards({
  choices,
  onSelect,
  disabled,
}: ChoiceCardsProps) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-sm">
      {choices.map(({ id, label, description, icon: Icon, recommended }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          disabled={disabled}
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl text-left',
            'border border-input bg-background transition-all',
            'hover:bg-accent',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50 disabled:pointer-events-none'
          )}
        >
          {Icon && (
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-muted">
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{label}</span>
              {recommended && (
                <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                  Recommended
                </span>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground truncate">{description}</p>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
