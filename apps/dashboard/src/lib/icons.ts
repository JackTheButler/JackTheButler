/**
 * Icon size constants for consistent icon sizing across the dashboard.
 *
 * @example
 * import { iconSize } from '@/lib/icons';
 * <Plus className={iconSize.sm} />
 * <AlertCircle className={iconSize.xl} />
 */

export const iconSize = {
  /** 12px - Tiny icons in compact badges */
  xs: 'w-3 h-3',
  /** 14px - Small icons in buttons with size="xs" */
  'xs-button': 'w-3.5 h-3.5',
  /** 16px - Standard icons in buttons and inline text */
  sm: 'w-4 h-4',
  /** 20px - Medium icons */
  md: 'w-5 h-5',
  /** 24px - Large icons */
  lg: 'w-6 h-6',
  /** 32px - Extra large icons (spinners, feature icons) */
  xl: 'w-8 h-8',
  /** 48px - Empty state icons */
  '2xl': 'w-12 h-12',
} as const;

export type IconSize = keyof typeof iconSize;
