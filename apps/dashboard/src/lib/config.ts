/**
 * Shared configuration constants for the dashboard.
 * Filter options and badge variant mappings.
 */

import type { BadgeVariant } from '@/components/ui/badge';
import type {
  TaskStatus,
  ReservationStatus,
  ConversationState,
} from '@/types/api';

// --- Filter Options ---

export type FilterOption<T> = { value: T | 'all'; label: string };

export const taskStatusFilters: FilterOption<TaskStatus>[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

export const reservationStatusFilters: FilterOption<ReservationStatus>[] = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'checked_in', label: 'Checked In' },
  { value: 'checked_out', label: 'Checked Out' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const conversationStateFilters: FilterOption<ConversationState>[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
];

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export const approvalStatusFilters: FilterOption<ApprovalStatus>[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

// --- Badge Variant Mappings ---

export const taskStatusVariants: Record<string, BadgeVariant> = {
  pending: 'warning',
  assigned: 'default',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'default',
};

export const reservationStatusVariants: Record<string, BadgeVariant> = {
  confirmed: 'default',
  checked_in: 'success',
  checked_out: 'default',
  cancelled: 'error',
  no_show: 'error',
};

export const conversationStateVariants: Record<string, BadgeVariant> = {
  new: 'info',
  active: 'success',
  escalated: 'error',
  resolved: 'default',
  closed: 'default',
};

export const approvalStatusVariants: Record<string, BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
};

export const priorityVariants: Record<string, BadgeVariant> = {
  urgent: 'error',
  high: 'warning',
  standard: 'default',
  low: 'default',
};

export const vipVariants: Record<string, BadgeVariant> = {
  diamond: 'dark',
  platinum: 'dark',
  gold: 'gold',
  silver: 'dark',
};

export const loyaltyVariants: Record<string, BadgeVariant> = {
  platinum: 'default',
  gold: 'warning',
  silver: 'default',
  member: 'default',
};
