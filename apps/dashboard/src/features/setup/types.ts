/**
 * Setup Feature Types
 *
 * Type definitions for the setup wizard feature.
 *
 * @module features/setup/types
 */

/**
 * Property type options
 */
export type PropertyType = 'hotel' | 'bnb' | 'vacation_rental' | 'other';

/**
 * AI provider options
 */
export type AIProvider = 'local' | 'anthropic' | 'openai';

/**
 * Knowledge categories
 */
export type KnowledgeCategory =
  | 'policy'
  | 'room_type'
  | 'contact'
  | 'local_info'
  | 'amenity'
  | 'service'
  | 'dining'
  | 'faq'
  | 'other';

/**
 * High-level setup step
 */
export type SetupStep = 'loading' | 'bootstrap' | 'chat';

/**
 * Chat-based wizard steps
 */
export type ChatStep =
  | 'greeting'
  | 'ask_name'
  | 'ask_type'
  | 'ask_ai_provider'
  | 'ask_api_key'
  | 'ask_website'
  | 'scraping'
  | 'show_checklist'
  | 'ask_manual_checkin'
  | 'ask_manual_room'
  | 'ask_manual_contact'
  | 'ask_manual_location'
  | 'ask_admin'
  | 'complete'
  | 'done';

/**
 * Setup state from the backend
 */
export interface SetupState {
  status: string;
  currentStep: string | null;
  completedSteps: string[];
  context: SetupContext;
  isFreshInstall: boolean;
}

/**
 * Context data collected during setup
 */
export interface SetupContext {
  propertyName?: string;
  propertyType?: PropertyType;
  aiProvider?: AIProvider;
  aiConfigured?: boolean;
  adminCreated?: boolean;
}

/**
 * Extracted knowledge entry
 */
export interface ExtractedEntry {
  title: string;
  content: string;
  category: KnowledgeCategory;
  keywords: string[];
  confidence: number;
}

/**
 * Checklist item for knowledge verification
 */
export interface ChecklistItem {
  id: string;
  label: string;
  found: boolean;
  count?: number;
  required: boolean;
}

/**
 * Hotel profile data extracted from knowledge
 */
export interface HotelProfile {
  name?: string;
  type?: string;
  checkInTime?: string;
  checkOutTime?: string;
  contactPhone?: string;
  contactEmail?: string;
  address?: string;
}

/**
 * Knowledge checklist state
 */
export interface KnowledgeChecklist {
  items: ChecklistItem[];
  entries: ExtractedEntry[];
  canContinue: boolean;
  profile?: HotelProfile;
}

/**
 * Response from process-message endpoint
 */
export interface ProcessMessageResponse {
  action: 'proceed' | 'show_message' | 'skip' | 'retry';
  message: string | null;
  data: { value: string } | null;
  stayOnStep?: boolean;
  nextStep?: string | null;
}

/**
 * Required categories for minimum knowledge
 */
export const REQUIRED_CATEGORIES: KnowledgeCategory[] = [
  'policy',
  'room_type',
  'contact',
  'local_info',
];

/**
 * Category to checklist item ID mapping
 */
export const CATEGORY_TO_ITEM: Record<KnowledgeCategory, string> = {
  policy: 'policy',
  room_type: 'room_type',
  contact: 'contact',
  local_info: 'local_info',
  amenity: 'amenity',
  service: 'service',
  dining: 'dining',
  faq: 'faq',
  other: 'other',
};

/**
 * Missing category to manual entry step mapping
 */
export const MISSING_CATEGORY_TO_STEP: Record<string, ChatStep> = {
  policy: 'ask_manual_checkin',
  room_type: 'ask_manual_room',
  contact: 'ask_manual_contact',
  local_info: 'ask_manual_location',
};

/**
 * Steps that use AI processing for messages
 */
export const AI_PROCESSED_STEPS: ChatStep[] = [
  'ask_website',
  'ask_manual_checkin',
  'ask_manual_room',
  'ask_manual_contact',
  'ask_manual_location',
];
