/**
 * Action Form Component
 *
 * Dynamic form rendering with conditional field visibility (showWhen),
 * native elements, validation, submit/cancel, spinner loading state.
 * Ported from test.html lines 126-236.
 */

import { createElement } from '../utils.js';
import type { WebChatActionField } from '../types.js';

export interface ActionForm {
  element: HTMLDivElement;
  remove(): void;
}

export function createActionForm(
  actionName: string,
  fields: WebChatActionField[],
  context: Record<string, string> | undefined,
  onSubmit: (data: Record<string, string>) => Promise<void>,
  onCancel: () => void
): ActionForm {
  const form = createElement('div', { class: 'butler-action-form' });

  const title = createElement('h3', { class: 'butler-form-title' }, [actionName]);
  form.appendChild(title);

  // Render fields
  for (const field of fields) {
    const fieldDiv = createElement('div', { class: 'butler-form-field' });
    fieldDiv.dataset.key = field.key;

    // Conditional visibility
    if (field.showWhen) {
      fieldDiv.classList.add('butler-form-field--hidden');
      fieldDiv.dataset.showWhenField = field.showWhen.field;
      fieldDiv.dataset.showWhenValues = JSON.stringify(field.showWhen.values);
    }

    const label = createElement('label', { class: 'butler-form-label' }, [
      field.label + (field.required ? ' *' : ''),
    ]);
    fieldDiv.appendChild(label);

    let input: HTMLInputElement | HTMLSelectElement;

    if (field.type === 'select' && field.options) {
      input = createElement('select', { class: 'butler-form-select' }) as HTMLSelectElement;
      input.name = field.key;

      const emptyOpt = createElement('option', { value: '' }, [
        `Select ${field.label}...`,
      ]) as HTMLOptionElement;
      input.appendChild(emptyOpt);

      for (const opt of field.options) {
        const option = createElement('option', { value: opt }, [
          opt.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        ]) as HTMLOptionElement;
        input.appendChild(option);
      }

      input.addEventListener('change', () => updateConditionalFields(form));
    } else {
      const typeMap: Record<string, string> = {
        email: 'email',
        tel: 'tel',
        date: 'date',
        number: 'number',
      };
      input = createElement('input', {
        class: 'butler-form-input',
        type: typeMap[field.type] ?? 'text',
      }) as HTMLInputElement;
      input.name = field.key;
      if (field.placeholder) input.placeholder = field.placeholder;
    }

    // Pre-fill from context
    if (context?.[field.key]) {
      input.value = context[field.key];
      (input as HTMLInputElement).readOnly = true;
      input.classList.add('butler-form-input--readonly');
    }

    fieldDiv.appendChild(input);
    form.appendChild(fieldDiv);
  }

  // Action buttons
  const actionsDiv = createElement('div', { class: 'butler-form-actions' });

  const submitBtn = createElement('button', {
    class: 'butler-form-submit',
    type: 'button',
  }, ['Submit']);

  const cancelBtn = createElement('button', {
    class: 'butler-form-cancel',
    type: 'button',
  }, ['Cancel']);

  submitBtn.addEventListener('click', async () => {
    const data = collectFormData(form, fields, context);
    if (!data) return; // Validation failed

    // Show loading state
    submitBtn.disabled = true;
    submitBtn.classList.add('butler-form-submit--loading');
    submitBtn.textContent = '';

    const spinner = createElement('span', { class: 'butler-form-spinner' });
    submitBtn.appendChild(spinner);
    submitBtn.appendChild(document.createTextNode(' Submitting...'));

    try {
      await onSubmit(data);
    } catch {
      // Reset button on error
      submitBtn.disabled = false;
      submitBtn.classList.remove('butler-form-submit--loading');
      submitBtn.textContent = 'Submit';
    }
  });

  cancelBtn.addEventListener('click', onCancel);

  actionsDiv.appendChild(submitBtn);
  actionsDiv.appendChild(cancelBtn);
  form.appendChild(actionsDiv);

  // Initial conditional field visibility
  updateConditionalFields(form);

  return {
    element: form,
    remove() {
      form.remove();
    },
  };
}

function updateConditionalFields(form: HTMLDivElement): void {
  const conditionalFields = form.querySelectorAll<HTMLDivElement>(
    '.butler-form-field[data-show-when-field]'
  );

  for (const fieldEl of conditionalFields) {
    const depFieldKey = fieldEl.dataset.showWhenField!;
    const allowedValues: string[] = JSON.parse(fieldEl.dataset.showWhenValues!);
    const depInput = form.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[name="${depFieldKey}"]`
    );

    if (depInput && allowedValues.includes(depInput.value)) {
      fieldEl.classList.remove('butler-form-field--hidden');
    } else {
      fieldEl.classList.add('butler-form-field--hidden');
    }
  }
}

function collectFormData(
  form: HTMLDivElement,
  fields: WebChatActionField[],
  context?: Record<string, string>
): Record<string, string> | null {
  const data: Record<string, string> = {};

  // Merge context first
  if (context) {
    Object.assign(data, context);
  }

  const inputs = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select');
  for (const input of inputs) {
    if (input.name && !input.closest('.butler-form-field--hidden')) {
      data[input.name] = input.value;
    }
  }

  // Validate required fields
  for (const field of fields) {
    // Skip validation for conditionally hidden required fields
    if (field.required && field.showWhen) {
      const depInput = form.querySelector<HTMLInputElement | HTMLSelectElement>(
        `[name="${field.showWhen.field}"]`
      );
      if (!depInput || !field.showWhen.values.includes(depInput.value)) continue;
    }

    if (field.required && !data[field.key]) {
      // Show error on the field
      const fieldEl = form.querySelector<HTMLDivElement>(
        `.butler-form-field[data-key="${field.key}"]`
      );
      if (fieldEl) {
        fieldEl.classList.add('butler-form-field--error');
        let errorEl = fieldEl.querySelector('.butler-form-error');
        if (!errorEl) {
          errorEl = createElement('div', { class: 'butler-form-error' }, [
            `${field.label} is required`,
          ]);
          fieldEl.appendChild(errorEl);
        }
      }
      return null;
    }
  }

  return data;
}
