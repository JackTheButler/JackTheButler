import * as React from 'react';
import { Combobox, type ComboboxOption } from './combobox';

// Generate time options in 30-minute intervals
function generateTimeOptions(): ComboboxOption[] {
  const options: ComboboxOption[] = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const ampm = hour < 12 ? 'AM' : 'PM';
      const label = `${hour12}:${minute.toString().padStart(2, '0')} ${ampm}`;
      options.push({ value: time, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

interface TimeSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function TimeSelect({
  value,
  onValueChange,
  placeholder = 'Select time...',
  className,
  disabled,
}: TimeSelectProps) {
  return (
    <Combobox
      options={TIME_OPTIONS}
      value={value}
      onValueChange={onValueChange}
      placeholder={placeholder}
      searchPlaceholder="Search time..."
      emptyText="No time found."
      className={className}
      disabled={disabled}
    />
  );
}
