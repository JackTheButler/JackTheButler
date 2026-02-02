/**
 * Shared API types for the dashboard.
 */

// --- Status Types ---

export type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type TaskSource = 'manual' | 'auto' | 'automation';
export type ReservationStatus = 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type ConversationState = 'new' | 'active' | 'escalated' | 'resolved' | 'closed';

// --- Guest ---

export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  language: string;
  loyaltyTier: string | null;
  vipStatus: string | null;
  preferences: string[];
  tags: string[];
  notes: string | null;
  stayCount: number;
  totalRevenue: number;
  lastStayDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Guest with related counts (for profile page) */
export interface GuestWithCounts extends Guest {
  _counts: {
    reservations: number;
    conversations: number;
  };
}

/** Minimal guest info (for embedded references) */
export interface GuestSummary {
  id: string;
  firstName: string;
  lastName: string;
  vipStatus: string | null;
  loyaltyTier: string | null;
}

// --- Reservation ---

export interface Reservation {
  id: string;
  confirmationNumber: string;
  guestId: string;
  roomNumber: string | null;
  roomType: string;
  arrivalDate: string;
  departureDate: string;
  estimatedArrival: string | null;
  estimatedDeparture: string | null;
  status: ReservationStatus;
  adults: number;
  children: number;
  specialRequests: string[];
  notes: string[];
  source: string;
  createdAt: string;
  guest: GuestSummary | null;
}

/** Minimal reservation info (for lists) */
export interface ReservationSummary {
  id: string;
  confirmationNumber: string;
  roomNumber: string | null;
  roomType: string;
  arrivalDate: string;
  departureDate: string;
  status: ReservationStatus | string;
}

// --- Task ---

export interface Task {
  id: string;
  conversationId: string | null;
  messageId?: string | null;
  source?: TaskSource;
  type: string;
  department: string;
  roomNumber: string | null;
  description: string;
  priority: string;
  status: TaskStatus | string;
  assignedTo: string | null;
  assignedName?: string;
  dueAt?: string | null;
  createdAt: string;
}

// --- Conversation ---

export interface Conversation {
  id: string;
  channelType: string;
  channelId: string;
  state: ConversationState | string;
  guestId: string | null;
  guestName?: string;
  assignedTo: string | null;
  currentIntent: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  messageCount: number;
  taskCount?: number;
}
