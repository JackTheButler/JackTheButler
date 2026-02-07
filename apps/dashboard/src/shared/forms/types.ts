/**
 * Shared Form System Types
 *
 * Declarative form schemas with validation.
 *
 * @module shared/forms/types
 */

/**
 * Field validation configuration
 */
export interface FieldValidation {
  /** Regex pattern to match */
  pattern?: RegExp;

  /** Minimum length */
  minLength?: number;

  /** Maximum length */
  maxLength?: number;

  /** Custom validation function - returns error message or null */
  custom?: (value: string, allValues: Record<string, string>) => string | null;

  /** Error message for pattern/length validation */
  message?: string;
}

/**
 * Form field configuration
 */
export interface FormField {
  /** Unique field key */
  key: string;

  /** Field input type */
  type: 'text' | 'email' | 'password' | 'url' | 'select' | 'textarea';

  /** Display label */
  label: string;

  /** Placeholder text */
  placeholder?: string;

  /** Whether field is required */
  required?: boolean;

  /** Help text shown below field */
  help?: string;

  /** Default value */
  defaultValue?: string;

  /** Validation configuration */
  validation?: FieldValidation;

  /** Conditional visibility based on other field values */
  showWhen?: (values: Record<string, string>) => boolean;

  /** Options for select type */
  options?: Array<{ value: string; label: string }>;

  /** Auto-complete attribute */
  autoComplete?: string;
}

/**
 * Form schema configuration
 */
export interface FormSchema {
  /** Unique schema ID */
  id: string;

  /** Form title */
  title: string;

  /** Form description */
  description?: string;

  /** Form fields */
  fields: FormField[];

  /** Submit button label */
  submitLabel?: string;

  /** Skip button label (if skippable) */
  skipLabel?: string;

  /** Help button label */
  helpLabel?: string;

  /** Cross-field validation function */
  validate?: (values: Record<string, string>) => Record<string, string>;
}

/**
 * Form state
 */
export interface FormState {
  /** Current field values */
  values: Record<string, string>;

  /** Field errors */
  errors: Record<string, string>;

  /** Fields that have been touched/blurred */
  touched: Record<string, boolean>;

  /** Whether form is submitting */
  isSubmitting: boolean;

  /** Whether form is valid */
  isValid: boolean;
}

/**
 * Form render props
 */
export interface FormRenderProps {
  /** Form schema to render */
  schema: FormSchema;

  /** Initial field values */
  initialValues?: Record<string, string>;

  /** Called when form is submitted with valid values */
  onSubmit: (values: Record<string, string>) => void | Promise<void>;

  /** Called when skip button is clicked */
  onSkip?: () => void;

  /** Called when help button is clicked */
  onHelp?: () => void;

  /** Whether form is disabled */
  disabled?: boolean;

  /** Additional CSS class */
  className?: string;
}
