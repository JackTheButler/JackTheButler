import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

export interface FormField {
  key: string;
  type: 'text' | 'password' | 'email' | 'url';
  label: string;
  placeholder?: string;
  required?: boolean;
  help?: string;
  defaultValue?: string;
}

export interface FormCardProps {
  title: string;
  description?: string;
  fields: FormField[];
  submitLabel?: string;
  skipLabel?: string;
  helpLabel?: string;
  onSubmit: (data: Record<string, string>) => void;
  onSkip?: () => void;
  onHelp?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export function FormCard({
  title,
  description,
  fields,
  submitLabel,
  skipLabel,
  helpLabel,
  onSubmit,
  onSkip,
  onHelp,
  disabled,
  loading,
}: FormCardProps) {
  const { t } = useTranslation('setup');
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of fields) {
      initial[field.key] = field.defaultValue || '';
    }
    return initial;
  });
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const togglePasswordVisibility = (key: string) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!disabled && !loading) {
      onSubmit(values);
    }
  };

  const isValid = fields
    .filter((f) => f.required)
    .every((f) => values[f.key]?.trim());

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="off"
      className="w-full max-w-md bg-card border border-border rounded-lg shadow-md"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>

      {/* Fields */}
      <div className="px-4 py-2 space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <div className="flex items-center gap-1 mb-1.5">
              <label
                htmlFor={field.key}
                className="text-sm font-medium text-foreground"
              >
                {field.label}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
              </label>
              {field.help && (
                <Tooltip content={field.help}>
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                </Tooltip>
              )}
            </div>
            <div className="relative">
              <input
                id={field.key}
                name={`${field.key}-${Date.now()}`}
                type={
                  field.type === 'password' && !showPasswords[field.key]
                    ? 'password'
                    : field.type === 'password'
                    ? 'text'
                    : field.type
                }
                value={values[field.key]}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                disabled={disabled || loading}
                autoComplete="new-password"
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore
                className={cn(
                  'w-full px-3 py-2 rounded-md border border-input bg-background',
                  'text-sm placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  field.type === 'password' && 'pr-10'
                )}
              />
              {field.type === 'password' && (
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility(field.key)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPasswords[field.key] ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>
        ))}
        {onHelp && (
          <button
            type="button"
            onClick={onHelp}
            disabled={disabled || loading}
            className="text-xs text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 mt-2"
          >
            {helpLabel || t('formCard.needHelp')}
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pt-2 pb-4 flex items-center justify-end gap-2">
        {onSkip && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSkip}
            disabled={disabled || loading}
          >
            {skipLabel || t('formCard.skip')}
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={disabled || loading || !isValid}
          loading={loading}
        >
          {submitLabel || t('formCard.submit')}
        </Button>
      </div>
    </form>
  );
}
