import { cn } from './cn';
import { fieldBase } from './fieldStyles';

/** Color swatch + hex text, kept in sync. Primitive so colour fields look
 *  consistent wherever they appear. */
export function ColorInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        type="color"
        aria-label="Color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-line bg-transparent p-0 [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldBase, 'flex-1')}
      />
    </div>
  );
}
