/**
 * Database Seed Script
 *
 * Creates initial data for development/testing.
 * Run with: pnpm db:seed
 */

import { db, staff, settings, knowledgeBase } from './index.js';
import { generateId } from '@/utils/id.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('seed');

/**
 * Knowledge base seed data
 */
const knowledgeSeedData = [
  // FAQ
  {
    category: 'faq',
    title: 'Checkout Time',
    content:
      'Standard checkout time is 11:00 AM. Late checkout until 2:00 PM is available for $50 (subject to availability). Please contact the front desk to request late checkout. Express checkout is available via the TV or mobile app.',
    keywords: JSON.stringify(['checkout', 'time', 'late checkout', 'check out', 'leaving']),
    priority: 10,
  },
  {
    category: 'faq',
    title: 'Check-in Time',
    content:
      'Standard check-in time is 3:00 PM. Early check-in may be available upon request (subject to availability). If you arrive before your room is ready, we can store your luggage at the front desk.',
    keywords: JSON.stringify(['checkin', 'check-in', 'arrive', 'arrival', 'early']),
    priority: 10,
  },
  {
    category: 'faq',
    title: 'WiFi Access',
    content:
      'Complimentary WiFi is available throughout the hotel. Network name: "DemoHotel_Guest". Password: "Welcome2024". For premium high-speed WiFi, please contact the front desk.',
    keywords: JSON.stringify(['wifi', 'internet', 'password', 'network', 'connection']),
    priority: 9,
  },
  {
    category: 'faq',
    title: 'Parking',
    content:
      'Self-parking is available for $25/night. Valet parking is $40/night. Electric vehicle charging stations are available on level P2. The parking garage is accessible 24/7 with your room key.',
    keywords: JSON.stringify(['parking', 'car', 'valet', 'garage', 'EV', 'charging']),
    priority: 8,
  },

  // Amenities
  {
    category: 'amenity',
    title: 'Swimming Pool',
    content:
      'The pool is located on the 4th floor rooftop. Hours: 6:00 AM to 10:00 PM daily. Towels are provided poolside. The pool is heated year-round. Children under 12 must be accompanied by an adult.',
    keywords: JSON.stringify(['pool', 'swimming', 'swim', 'rooftop', 'hours']),
    priority: 8,
  },
  {
    category: 'amenity',
    title: 'Fitness Center',
    content:
      'The fitness center is located on the 3rd floor. Open 24 hours for hotel guests. Features cardio machines, free weights, and yoga mats. Personal training sessions available upon request.',
    keywords: JSON.stringify(['gym', 'fitness', 'workout', 'exercise', 'weights']),
    priority: 7,
  },
  {
    category: 'amenity',
    title: 'Spa Services',
    content:
      'Our full-service spa is located on the 2nd floor. Hours: 9:00 AM to 8:00 PM. Services include massages, facials, and body treatments. Reservations recommended. Call extension 250 to book.',
    keywords: JSON.stringify(['spa', 'massage', 'facial', 'treatment', 'relax']),
    priority: 7,
  },
  {
    category: 'amenity',
    title: 'Business Center',
    content:
      'The business center is located in the lobby. Open 24 hours. Features computers, printing, and fax services. Printing: $0.25/page. Meeting rooms available for reservation.',
    keywords: JSON.stringify(['business', 'computer', 'print', 'fax', 'meeting']),
    priority: 6,
  },

  // Dining
  {
    category: 'dining',
    title: 'Room Service',
    content:
      'Room service is available 24/7. The full menu is available from 6:00 AM to 11:00 PM. A limited late-night menu is available from 11:00 PM to 6:00 AM. Delivery typically takes 30-45 minutes. Dial extension 100 to order.',
    keywords: JSON.stringify(['room service', 'food', 'order', 'delivery', 'menu']),
    priority: 9,
  },
  {
    category: 'dining',
    title: 'Restaurant - The Grand Cafe',
    content:
      'The Grand Cafe is located on the ground floor. Breakfast: 6:30 AM - 10:30 AM. Lunch: 11:30 AM - 2:30 PM. Dinner: 5:30 PM - 10:00 PM. Reservations recommended for dinner. Call extension 150.',
    keywords: JSON.stringify(['restaurant', 'dining', 'breakfast', 'lunch', 'dinner', 'cafe']),
    priority: 8,
  },
  {
    category: 'dining',
    title: 'Bar - The Skylight Lounge',
    content:
      'The Skylight Lounge is located on the rooftop. Hours: 4:00 PM to midnight (until 2:00 AM on weekends). Features craft cocktails, wine, and light bites. Live music on Friday and Saturday evenings.',
    keywords: JSON.stringify(['bar', 'drinks', 'cocktails', 'lounge', 'wine']),
    priority: 7,
  },

  // Services
  {
    category: 'service',
    title: 'Housekeeping',
    content:
      'Daily housekeeping is provided between 9:00 AM and 4:00 PM. For immediate service or additional requests (towels, toiletries, pillows), please contact housekeeping at extension 200 or through the in-room tablet.',
    keywords: JSON.stringify(['housekeeping', 'cleaning', 'towels', 'pillows', 'maid']),
    priority: 9,
  },
  {
    category: 'service',
    title: 'Laundry and Dry Cleaning',
    content:
      'Laundry service is available daily. Items left before 9:00 AM will be returned by 6:00 PM same day. Express service (3 hours) available for an additional fee. Laundry bags are in the closet.',
    keywords: JSON.stringify(['laundry', 'dry cleaning', 'clothes', 'pressing', 'wash']),
    priority: 7,
  },
  {
    category: 'service',
    title: 'Concierge Services',
    content:
      'Our concierge is available 24/7 to assist with restaurant reservations, theater tickets, tours, transportation, and local recommendations. Visit the concierge desk in the lobby or dial extension 300.',
    keywords: JSON.stringify(['concierge', 'reservations', 'tickets', 'tours', 'recommendations']),
    priority: 8,
  },
  {
    category: 'service',
    title: 'Transportation',
    content:
      'Taxi and rideshare pickup is available at the main entrance. Airport shuttle service runs every 30 minutes from 5:00 AM to 11:00 PM ($15 per person). Private car service can be arranged through the concierge.',
    keywords: JSON.stringify(['taxi', 'uber', 'lyft', 'shuttle', 'airport', 'transportation']),
    priority: 8,
  },

  // Policies
  {
    category: 'policy',
    title: 'Pet Policy',
    content:
      'We welcome pets in designated pet-friendly rooms. A $50 per night pet fee applies. Maximum 2 pets per room, under 50 lbs each. Pets must be leashed in public areas. Pet amenities available upon request.',
    keywords: JSON.stringify(['pet', 'dog', 'cat', 'animal', 'pets allowed']),
    priority: 6,
  },
  {
    category: 'policy',
    title: 'Smoking Policy',
    content:
      'The hotel is 100% smoke-free. Smoking is permitted only in designated outdoor areas. A $250 cleaning fee applies for smoking in guest rooms. This includes e-cigarettes and vaping.',
    keywords: JSON.stringify(['smoking', 'smoke', 'cigarette', 'vape', 'tobacco']),
    priority: 5,
  },
];

async function seed() {
  log.info('Starting database seed...');

  // Check if already seeded
  const existingStaff = await db.select().from(staff).limit(1);
  if (existingStaff.length > 0) {
    log.info('Database already seeded, skipping');
    return;
  }

  // Seed settings
  const settingsData = [
    { key: 'hotel.name', value: 'Demo Hotel' },
    { key: 'hotel.timezone', value: 'UTC' },
    { key: 'ai.provider', value: 'anthropic' },
    { key: 'ai.model', value: 'claude-sonnet-4-20250514' },
  ];

  for (const setting of settingsData) {
    await db.insert(settings).values(setting);
  }
  log.info({ count: settingsData.length }, 'Seeded settings');

  // Seed staff users
  const staffData = [
    {
      id: 'staff-admin-001',
      email: 'admin@hotel.com',
      name: 'Admin User',
      role: 'admin',
      department: 'management',
      permissions: JSON.stringify(['*']),
      status: 'active',
      passwordHash: 'admin123', // In production, this would be hashed
    },
    {
      id: 'staff-manager-001',
      email: 'manager@hotel.com',
      name: 'Hotel Manager',
      role: 'manager',
      department: 'management',
      permissions: JSON.stringify(['guests:read', 'guests:write', 'tasks:*', 'staff:read']),
      status: 'active',
      passwordHash: 'manager123',
    },
    {
      id: 'staff-concierge-001',
      email: 'concierge@hotel.com',
      name: 'Concierge Staff',
      role: 'concierge',
      department: 'front_desk',
      permissions: JSON.stringify(['guests:read', 'tasks:read', 'tasks:write']),
      status: 'active',
      passwordHash: 'concierge123',
    },
  ];

  for (const member of staffData) {
    await db.insert(staff).values(member);
  }
  log.info({ count: staffData.length }, 'Seeded staff');

  // Seed knowledge base
  for (const item of knowledgeSeedData) {
    await db.insert(knowledgeBase).values({
      id: generateId('knowledge'),
      ...item,
    });
  }
  log.info({ count: knowledgeSeedData.length }, 'Seeded knowledge base');

  log.info('Database seed complete!');
}

seed().catch((error) => {
  log.error({ error }, 'Seed failed');
  process.exit(1);
});
