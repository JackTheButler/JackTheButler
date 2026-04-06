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
    description: 'Concierge requests requiring action (bookings, arrangements, taxi)',
    examples: [
      'Book a restaurant for tonight',
      'I need a taxi',
      'Arrange a tour',
      'Can you get me theatre tickets?',
    ],
    department: 'concierge',
    requiresAction: true,
    priority: 'standard',
  },
  'inquiry.concierge': {
    description: 'Questions seeking recommendations or information from concierge',
    examples: [
      'Can you recommend a good restaurant?',
      'What is there to do around here?',
      'Any suggestions for nightlife?',
      'Where should I go for dinner?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'request.transport': {
    description: 'Transportation requests (taxi, shuttle, airport transfer)',
    examples: [
      'Call me a taxi',
      'Arrange a shuttle to the airport',
      'I need a car to the airport',
      'Book an airport transfer',
    ],
    department: 'concierge',
    requiresAction: true,
    priority: 'standard',
  },
  'inquiry.transport': {
    description: 'Questions about transportation options or directions',
    examples: [
      'How do I get to the airport?',
      'Is there a shuttle service?',
      'How far is the train station?',
      'What transport options are available?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'request.wakeup': {
    description: 'Request for a wake-up call',
    examples: [
      'Wake me up at 6am',
      'Set a wake-up call for tomorrow',
      'Can I get a morning call at 7?',
      'I need an alarm call',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'standard',
  },
  'request.luggage': {
    description: 'Luggage storage, delivery, or assistance',
    examples: [
      'Can I leave my bags after checkout?',
      'Where is luggage storage?',
      'Can someone bring my bags to the room?',
      'I need to store my suitcase',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'standard',
  },
  'request.laundry': {
    description: 'Laundry, dry cleaning, or ironing requests',
    examples: [
      'Can I get my clothes laundered?',
      'Do you have dry cleaning?',
      'I need a shirt ironed',
      'Where is the laundry room?',
    ],
    department: 'housekeeping',
    requiresAction: true,
    priority: 'standard',
  },
  'request.dnd': {
    description: 'Do not disturb or skip housekeeping request',
    examples: [
      "Don't clean my room today",
      'No housekeeping please',
      'Do not disturb',
      'Skip cleaning tomorrow',
    ],
    department: 'housekeeping',
    requiresAction: true,
    priority: 'low',
  },
  'request.room_change': {
    description: 'Request to change or switch rooms',
    examples: [
      'I want to change rooms',
      'Can I move to a different room?',
      'This room is too noisy, can I switch?',
      'I need a room on a higher floor',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'high',
  },
  'request.lost_found': {
    description: 'Report of lost item or inquiry about found items',
    examples: [
      'I lost my wallet',
      'I left something in my room',
      'Did anyone find a phone?',
      'I forgot my charger at the hotel',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'standard',
  },
  'request.security': {
    description: 'Security concern or room lockout (non-emergency)',
    examples: [
      'I am locked out of my room',
      'My key card is not working',
      'Someone is being loud in the hallway',
      'I feel unsafe',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'high',
  },
  'request.noise': {
    description: 'Noise complaint about other guests or surroundings',
    examples: [
      'The room next door is too loud',
      'Can you tell them to be quiet?',
      'There is a party on my floor',
      'Too much noise, I cannot sleep',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'high',
  },
  'request.special_occasion': {
    description: 'Special occasion arrangements (birthday, anniversary, surprise)',
    examples: [
      "It's our anniversary, can you arrange something?",
      'Can you put flowers in the room?',
      'Birthday surprise for my partner',
      'Can you arrange a cake?',
    ],
    department: 'concierge',
    requiresAction: true,
    priority: 'standard',
  },
  'inquiry.parking': {
    description: 'Questions about parking options, valet, or fees',
    examples: [
      'Where can I park?',
      'How much is parking?',
      'Do you have valet parking?',
      'Is there a car park nearby?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'inquiry.accessibility': {
    description: 'Questions about accessibility features or disability accommodations',
    examples: [
      'Do you have accessible rooms?',
      'Is there a wheelchair ramp?',
      'Do you have an elevator?',
      'I need a disability-friendly room',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'inquiry.pet_policy': {
    description: 'Questions about pet policies and fees',
    examples: [
      'Can I bring my dog?',
      'Is this hotel pet-friendly?',
      "What's the pet fee?",
      'Are pets allowed?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'request.reservation.cancel': {
    description: 'Request to cancel a reservation',
    examples: [
      'I want to cancel my booking',
      'Cancel my reservation',
      "I can't make it, please cancel",
      'What is the cancellation policy?',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'high',
  },

  // Inquiries
  'inquiry.checkout': {
    description: 'Questions about checkout time or procedure',
    examples: [
      'What time is checkout?',
      'How do I check out?',
      'When do I need to leave?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'request.checkout.late': {
    description: 'Request for late checkout',
    examples: [
      'Can I get late checkout?',
      'I need to check out later',
      'Is late checkout available?',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'standard',
  },
  'inquiry.checkin': {
    description: 'Questions about check-in time or procedure',
    examples: [
      'What time is check-in?',
      'How do I check in?',
      'Where do I go to check in?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'request.checkin.early': {
    description: 'Request for early check-in',
    examples: [
      'Can I check in early?',
      'I need early check-in',
      'Is early check-in available?',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'standard',
  },
  'inquiry.wifi': {
    description: 'Questions about WiFi password, connection, or availability',
    examples: [
      'What is the WiFi password?',
      'How do I connect to WiFi?',
      'Is there internet?',
      'What network should I connect to?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'request.maintenance.wifi': {
    description: 'WiFi or internet not working, needs technical fix',
    examples: [
      'WiFi not working',
      'Internet is down',
      "I can't connect to the WiFi",
      'The internet is very slow',
    ],
    department: 'maintenance',
    requiresAction: true,
    priority: 'high',
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
  'request.billing.receipt': {
    description: 'Request for invoice, receipt, or billing document',
    examples: [
      'Can I get an itemized receipt?',
      'I need an invoice for my company',
      'Please email me my bill',
      'Can I get a tax invoice?',
    ],
    department: 'front_desk',
    requiresAction: true,
    priority: 'standard',
  },
  'inquiry.reservation.status': {
    description: 'Questions about existing reservation details, dates, or confirmation',
    examples: [
      'Do I have a booking?',
      "What's my confirmation number?",
      'When is my check-in date?',
      'Can you look up my reservation?',
    ],
    department: null,
    requiresAction: false,
    priority: 'low',
  },
  'request.reservation.modify': {
    description: 'Requests to change, extend, upgrade, or cancel a reservation',
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
