/**
 * Demo Data Helpers
 *
 * Utility functions for generating demo data.
 */

import { randomUUID } from 'node:crypto';

export function generateId(): string {
  return randomUUID();
}

export function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0]!;
}

export function dateTimeFromNow(days: number, hours: number = 14): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, 0, 0, 0);
  return date.toISOString();
}
