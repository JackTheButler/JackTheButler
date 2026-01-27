/**
 * Intent Taxonomy
 *
 * Defines the classification categories for guest messages.
 * Each intent has a description, examples, and routing information.
 */

/**
 * Intent definition with metadata
 */
export interface IntentDefinition {
  description: string;
  examples: string[];
  department: string | null;
  requiresAction: boolean;
  priority: 'low' | 'standard' | 'high' | 'urgent';
}

/**
 * Hotel-specific intent taxonomy
 */
export const IntentTaxonomy: Record<string, IntentDefinition> = {
  // Service Requests
  'request.housekeeping.towels': {
    description: 'Request for additional towels',
    examples: ['I need more towels', 'Can I get extra towels please?', 'Send some towels to my room'],
    department: 'housekeeping',
    requiresAction: true,
    priority: 'standard',
  },
  'request.housekeeping.cleaning': {
    description: 'Request for room cleaning',
    examples: ['Can you clean my room?', 'I need housekeeping', 'The room needs cleaning'],
    department: 'housekeeping',
    requiresAction: true,
    priority: 'standard',
  },
  'request.housekeeping.amenities': {
    description: 'Request for room amenities (toiletries, pillows, etc)',
    examples: [
      'I need extra pillows',
      'Can I get more shampoo?',
      'Need a blanket',
      'Extra hangers please',
    ],
    department: 'housekeeping',
    requiresAction: true,
    priority: 'standard',
  },
  'request.maintenance': {
    description: 'Report of something broken or maintenance needed',
    examples: [
      'The AC is not working',
      'Toilet is clogged',
      'Light bulb is out',
      'TV is broken',
      'Hot water not working',
    ],
    department: 'maintenance',
    requiresAction: true,
    priority: 'high',
  },
  'request.room_service': {
    description: 'Food or beverage order',
    examples: [
      'I want to order room service',
      'Can I order breakfast?',
      'Send a bottle of wine',
      'I want to order food',
    ],
    department: 'room_service',
    requiresAction: true,
    priority: 'standard',
  },
  'request.concierge': {
    description: 'General concierge requests (reservations, recommendations)',
    examples: [
      'Book a restaurant for tonight',
      'I need a taxi',
      'Can you recommend a good restaurant?',
      'Arrange a tour',
    ],
    department: 'concierge',
    requiresAction: true,
    priority: 'standard',
  },

  // Inquiries
  'inquiry.checkout': {
    description: 'Questions about checkout time or procedure',
    examples: [
      'What time is checkout?',
      'Can I get late checkout?',
      'How do I check out?',
      'When do I need to leave?',
    ],
    department: 'front_desk',
    requiresAction: false,
    priority: 'low',
  },
  'inquiry.checkin': {
    description: 'Questions about check-in time or procedure',
    examples: [
      'What time is check-in?',
      'Can I check in early?',
      'How do I check in?',
      'Where do I go to check in?',
    ],
    department: 'front_desk',
    requiresAction: false,
    priority: 'low',
  },
  'inquiry.wifi': {
    description: 'Questions about WiFi or internet access',
    examples: [
      'What is the WiFi password?',
      'How do I connect to WiFi?',
      'Is there internet?',
      'WiFi not working',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'inquiry.amenity': {
    description: 'Questions about hotel amenities',
    examples: [
      'Where is the pool?',
      'What time does the gym open?',
      'Do you have a spa?',
      'Is breakfast included?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'inquiry.dining': {
    description: 'Questions about dining options',
    examples: [
      'What restaurants do you have?',
      'What time is breakfast?',
      'Where can I eat?',
      'Room service hours?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'inquiry.location': {
    description: 'Questions about locations (hotel facilities, nearby places)',
    examples: [
      'Where is the lobby?',
      'How do I get to the pool?',
      'Where can I park?',
      'Is there a pharmacy nearby?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'inquiry.billing': {
    description: 'Questions about charges, bills, or payments',
    examples: [
      'Can I see my bill?',
      "What's this charge for?",
      'How do I pay?',
      'Do you accept credit cards?',
    ],
    department: 'front_desk',
    requiresAction: false,
    priority: 'standard',
  },
  'inquiry.reservation': {
    description: 'Questions about existing or new reservations',
    examples: [
      'Can I extend my stay?',
      'I want to change my reservation',
      'Can I upgrade my room?',
      'Book another night',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'standard',
  },

  // Feedback
  'feedback.complaint': {
    description: 'Negative feedback or complaint',
    examples: [
      'I want to complain',
      'This is unacceptable',
      'Very disappointed',
      'I had a terrible experience',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'high',
  },
  'feedback.compliment': {
    description: 'Positive feedback or compliment',
    examples: [
      'Great service!',
      'The room is amazing',
      'Thank you so much',
      'Best hotel experience',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },

  // Conversation
  'greeting': {
    description: 'Greeting or hello',
    examples: ['Hello', 'Hi', 'Good morning', 'Hey there'],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'farewell': {
    description: 'Goodbye or thank you',
    examples: ['Goodbye', 'Thanks', 'Bye', 'Have a nice day'],
    department: null,
    requiresAction: false,
    priority: 'low',
  },

  // Emergency
  'emergency': {
    description: 'Emergency situation requiring immediate attention',
    examples: ['There is a fire', 'Medical emergency', 'Someone is hurt', 'Help!', 'Call 911'],
    department: 'front_desk',
    requiresAction: true,
    priority: 'urgent',
  },

  // Unknown
  'unknown': {
    description: 'Unable to classify the intent',
    examples: [],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
} as const;

/**
 * Get all intent names
 */
export function getIntentNames(): string[] {
  return Object.keys(IntentTaxonomy);
}

/**
 * Get intent definition by name
 */
export function getIntentDefinition(intent: string): IntentDefinition | undefined {
  return IntentTaxonomy[intent];
}

/**
 * Get intents by department
 */
export function getIntentsByDepartment(department: string): string[] {
  return Object.entries(IntentTaxonomy)
    .filter(([_, def]) => def.department === department)
    .map(([name]) => name);
}

/**
 * Get intents that require action
 */
export function getActionableIntents(): string[] {
  return Object.entries(IntentTaxonomy)
    .filter(([_, def]) => def.requiresAction)
    .map(([name]) => name);
}
