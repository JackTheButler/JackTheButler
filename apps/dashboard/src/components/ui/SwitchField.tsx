import { Switch } from './Switch';

/** Label + description row with a trailing Switch (form setting toggle). */
export function SwitchField({
  label,
  desc,
  checked,
  onCheckedChange,
  disabled = false,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      />
    </div>
  );
}
