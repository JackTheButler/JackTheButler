/**
 * Form Renderer Component
 *
 * Renders any FormSchema with validation.
 *
 * @module shared/forms/FormRenderer
 */

import { useState, useCallback } from 'react';
import { Eye, EyeOff, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { FormSchema, FormField, FormRenderProps } from './types';
import { runFieldValidation, runFormValidation, hasErrors } from './validators';

/**
 * Form Renderer - renders any FormSchema
 */
export function FormRenderer({
  schema,
  initialValues = {},
  onSubmit,
  onSkip,
  onHelp,
  disabled = false,
  className,
}: FormRenderProps) {
  // Initialize form state
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of schema.fields) {
      initial[field.key] = initialValues[field.key] || field.defaultValue || '';
    }
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Update field value
   */
  const handleChange = useCallback(
    (field: FormField, value: string) => {
      setValues((prev) => ({ ...prev, [field.key]: value }));

      // Clear error on change if field was touched
      if (touched[field.key]) {
        const error = runFieldValidation(field, value, { ...values, [field.key]: value });
        setErrors((prev) => {
          const next = { ...prev };
          if (error) {
            next[field.key] = error;
          } else {
            delete next[field.key];
          }
          return next;
        });
      }
    },
    [touched, values]
  );

  /**
   * Handle field blur
   */
  const handleBlur = useCallback(
    (field: FormField) => {
      setTouched((prev) => ({ ...prev, [field.key]: true }));

      // Validate on blur
      const error = runFieldValidation(field, values[field.key] || '', values);
      setErrors((prev) => {
        const next = { ...prev };
        if (error) {
          next[field.key] = error;
        } else {
          delete next[field.key];
        }
        return next;
      });
    },
    [values]
  );

  /**
   * Toggle password visibility
   */
  const togglePasswordVisibility = useCallback((fieldKey: string) => {
    setShowPassword((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  }, []);

  /**
   * Handle form submission
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Mark all fields as touched
      const allTouched: Record<string, boolean> = {};
      for (const field of schema.fields) {
        allTouched[field.key] = true;
      }
      setTouched(allTouched);

      // Run full validation
      const formErrors = runFormValidation(schema.fields, values, schema.validate);
      setErrors(formErrors);

      if (hasErrors(formErrors)) {
        return;
      }

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    },
    [schema, values, onSubmit]
  );

  /**
   * Check if a field should be visible
   */
  const isFieldVisible = useCallback(
    (field: FormField): boolean => {
      if (!field.showWhen) return true;
      return field.showWhen(values);
    },
    [values]
  );

  /**
   * Render a single field
   */
  const renderField = (field: FormField) => {
    if (!isFieldVisible(field)) return null;

    const error = touched[field.key] ? errors[field.key] : undefined;
    const value = values[field.key] || '';

    return (
      <div key={field.key} className="space-y-2">
        <Label htmlFor={field.key} className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>

        <div className="relative">
          {field.type === 'select' ? (
            <select
              id={field.key}
              value={value}
              onChange={(e) => handleChange(field, e.target.value)}
              onBlur={() => handleBlur(field)}
              disabled={disabled || isSubmitting}
              className={cn(
                'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                error && 'border-destructive'
              )}
            >
              <option value="">{field.placeholder || 'Select...'}</option>
              {field.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea
              id={field.key}
              value={value}
              onChange={(e) => handleChange(field, e.target.value)}
              onBlur={() => handleBlur(field)}
              placeholder={field.placeholder}
              disabled={disabled || isSubmitting}
              rows={4}
              className={cn(
                'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                error && 'border-destructive'
              )}
            />
          ) : (
            <>
              <Input
                id={field.key}
                type={
                  field.type === 'password'
                    ? showPassword[field.key]
                      ? 'text'
                      : 'password'
                    : field.type
                }
                value={value}
                onChange={(e) => handleChange(field, e.target.value)}
                onBlur={() => handleBlur(field)}
                placeholder={field.placeholder}
                disabled={disabled || isSubmitting}
                autoComplete={field.autoComplete || 'off'}
                className={cn(
                  field.type === 'password' && 'pr-10',
                  error && 'border-destructive'
                )}
              />
              {field.type === 'password' && (
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility(field.key)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword[field.key] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {field.help && !error && (
          <p className="text-sm text-muted-foreground">{field.help}</p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-6', className)}>
      {schema.title && (
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">{schema.title}</h3>
          {schema.description && (
            <p className="text-sm text-muted-foreground">{schema.description}</p>
          )}
        </div>
      )}

      <div className="space-y-4">{schema.fields.map(renderField)}</div>

      <div className="flex gap-3">
        <Button type="submit" disabled={disabled || isSubmitting} className="flex-1">
          {isSubmitting ? 'Please wait...' : schema.submitLabel || 'Continue'}
        </Button>

        {onSkip && (
          <Button
            type="button"
            variant="outline"
            onClick={onSkip}
            disabled={disabled || isSubmitting}
          >
            {schema.skipLabel || 'Skip'}
          </Button>
        )}

        {onHelp && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onHelp}
            disabled={disabled || isSubmitting}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * Hook for using form state externally
 */
export function useFormState(schema: FormSchema, initialValues: Record<string, string> = {}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of schema.fields) {
      initial[field.key] = initialValues[field.key] || field.defaultValue || '';
    }
    return initial;
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = useCallback(() => {
    const formErrors = runFormValidation(schema.fields, values, schema.validate);
    setErrors(formErrors);
    return !hasErrors(formErrors);
  }, [schema, values]);

  const setValue = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    const initial: Record<string, string> = {};
    for (const field of schema.fields) {
      initial[field.key] = initialValues[field.key] || field.defaultValue || '';
    }
    setValues(initial);
    setErrors({});
  }, [schema, initialValues]);

  return {
    values,
    errors,
    setValue,
    setValues,
    validate,
    reset,
    isValid: !hasErrors(errors),
  };
}
