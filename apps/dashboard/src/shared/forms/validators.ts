/**
 * Form Validators
 *
 * Validation functions for form fields.
 *
 * @module shared/forms/validators
 */

import type { FormField } from './types';

/**
 * Validate required field
 */
export function validateRequired(value: string, fieldLabel: string): string | null {
  if (!value || value.trim() === '') {
    return `${fieldLabel} is required`;
  }
  return null;
}

/**
 * Validate regex pattern
 */
export function validatePattern(
  value: string,
  pattern: RegExp,
  message?: string
): string | null {
  if (value && !pattern.test(value)) {
    return message || 'Invalid format';
  }
  return null;
}

/**
 * Validate minimum length
 */
export function validateMinLength(
  value: string,
  minLength: number,
  fieldLabel: string
): string | null {
  if (value && value.length < minLength) {
    return `${fieldLabel} must be at least ${minLength} characters`;
  }
  return null;
}

/**
 * Validate maximum length
 */
export function validateMaxLength(
  value: string,
  maxLength: number,
  fieldLabel: string
): string | null {
  if (value && value.length > maxLength) {
    return `${fieldLabel} must be at most ${maxLength} characters`;
  }
  return null;
}

/**
 * Validate email format
 */
export function validateEmail(value: string): string | null {
  if (!value) return null;

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(value)) {
    return 'Please enter a valid email address';
  }
  return null;
}

/**
 * Validate URL format
 */
export function validateUrl(value: string): string | null {
  if (!value) return null;

  try {
    new URL(value);
    return null;
  } catch {
    return 'Please enter a valid URL';
  }
}

/**
 * Run all validations for a single field
 */
export function runFieldValidation(
  field: FormField,
  value: string,
  allValues: Record<string, string>
): string | null {
  // Check required
  if (field.required) {
    const error = validateRequired(value, field.label);
    if (error) return error;
  }

  // Skip other validations if empty and not required
  if (!value || value.trim() === '') {
    return null;
  }

  const validation = field.validation;
  if (!validation) return null;

  // Check min length
  if (validation.minLength) {
    const error = validateMinLength(value, validation.minLength, field.label);
    if (error) return error;
  }

  // Check max length
  if (validation.maxLength) {
    const error = validateMaxLength(value, validation.maxLength, field.label);
    if (error) return error;
  }

  // Check pattern
  if (validation.pattern) {
    const error = validatePattern(value, validation.pattern, validation.message);
    if (error) return error;
  }

  // Built-in type validations
  if (field.type === 'email') {
    const error = validateEmail(value);
    if (error) return error;
  }

  if (field.type === 'url') {
    const error = validateUrl(value);
    if (error) return error;
  }

  // Custom validation
  if (validation.custom) {
    const error = validation.custom(value, allValues);
    if (error) return error;
  }

  return null;
}

/**
 * Run validations for all form fields
 */
export function runFormValidation(
  fields: FormField[],
  values: Record<string, string>,
  crossFieldValidate?: (values: Record<string, string>) => Record<string, string>
): Record<string, string> {
  const errors: Record<string, string> = {};

  // Run field-level validations
  for (const field of fields) {
    // Skip hidden fields
    if (field.showWhen && !field.showWhen(values)) {
      continue;
    }

    const value = values[field.key] || '';
    const error = runFieldValidation(field, value, values);
    if (error) {
      errors[field.key] = error;
    }
  }

  // Run cross-field validation
  if (crossFieldValidate) {
    const crossErrors = crossFieldValidate(values);
    Object.assign(errors, crossErrors);
  }

  return errors;
}

/**
 * Check if form has any errors
 */
export function hasErrors(errors: Record<string, string>): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Common validation patterns
 */
export const patterns = {
  /** At least one letter */
  hasLetter: /[a-zA-Z]/,

  /** At least one number */
  hasNumber: /\d/,

  /** No special characters */
  alphanumeric: /^[a-zA-Z0-9]+$/,

  /** API key format (alphanumeric with hyphens/underscores) */
  apiKey: /^[a-zA-Z0-9_-]+$/,

  /** Phone number */
  phone: /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/,
};
