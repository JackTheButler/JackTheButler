import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Choice {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface ChoiceButtonsProps {
  choices: Choice[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  layout?: 'inline' | 'grid';
  columns?: 2 | 3 | 4;
}

export function ChoiceButtons({
  choices,
  onSelect,
  disabled,
  layout = 'inline',
  columns = 2,
}: ChoiceButtonsProps) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  };

  return (
    <div
      className={cn(
        layout === 'inline' ? 'flex flex-wrap gap-2' : `grid ${gridCols[columns]} gap-2`,
        'w-full'
      )}
    >
      {choices.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          disabled={disabled}
          className={cn(
            'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full',
            'border border-input bg-background text-sm font-medium',
            'hover:bg-accent hover:border-accent-foreground/20 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50 disabled:pointer-events-none'
          )}
        >
          {Icon && <Icon className="w-4 h-4" />}
          {label}
        </button>
      ))}
    </div>
  );
}
