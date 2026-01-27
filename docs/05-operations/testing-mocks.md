# Test Fixtures & Mocks Specification

This document defines the mock strategy and test fixtures for Jack The Butler.

---

## Overview

Testing requires mocking external services:
- WhatsApp/Meta Business API
- Twilio SMS/Voice API
- PMS (Property Management Systems)
- AI providers (Claude, OpenAI, Ollama)

This specification defines consistent mock patterns for unit, integration, and e2e tests.

---

## Mock Architecture

### Mock Server vs Function Mocks

```typescript
// Level 1: Function mocks (unit tests)
// Fast, isolated, for testing business logic
vi.mock('@/services/whatsapp', () => ({
  WhatsAppClient: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue({ messageId: 'msg_123' }),
  })),
}));

// Level 2: HTTP mocks (integration tests)
// Uses MSW to intercept HTTP requests
const server = setupServer(
  rest.post('https://graph.facebook.com/*', (req, res, ctx) => {
    return res(ctx.json({ messages: [{ id: 'wamid.xxx' }] }));
  })
);

// Level 3: Mock server (e2e tests)
// Actual HTTP server for realistic testing
const mockWhatsApp = new MockWhatsAppServer({ port: 9001 });
await mockWhatsApp.start();
```

---

## WhatsApp API Mocks

### Mock Responses

```typescript
// tests/mocks/whatsapp/responses.ts

export const WHATSAPP_MOCK_RESPONSES = {
  // Send message success
  sendMessage: {
    messaging_product: 'whatsapp',
    contacts: [{ input: '+1234567890', wa_id: '1234567890' }],
    messages: [{ id: 'wamid.HBgLMTIzNDU2Nzg5MAUCABIYFjNFQjBGODI0MjQ0RjdBM0QxNjIw' }],
  },

  // Send template message
  sendTemplate: {
    messaging_product: 'whatsapp',
    contacts: [{ input: '+1234567890', wa_id: '1234567890' }],
    messages: [{ id: 'wamid.template_123' }],
  },

  // Upload media
  uploadMedia: {
    id: 'media_id_123456',
  },

  // Get media URL
  getMediaUrl: {
    url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123',
    mime_type: 'image/jpeg',
    sha256: 'abc123',
    file_size: 12345,
  },

  // Errors
  errors: {
    invalidToken: {
      error: {
        message: 'Invalid OAuth access token.',
        type: 'OAuthException',
        code: 190,
        fbtrace_id: 'abc123',
      },
    },
    rateLimited: {
      error: {
        message: '(#4) Application request limit reached',
        type: 'OAuthException',
        code: 4,
        fbtrace_id: 'def456',
      },
    },
    invalidPhone: {
      error: {
        message: 'Invalid phone number format',
        type: 'OAuthException',
        code: 100,
        error_data: { messaging_product: 'whatsapp', details: 'Invalid phone number' },
      },
    },
  },
};
```

### Mock Webhook Events

```typescript
// tests/mocks/whatsapp/webhooks.ts

export const WHATSAPP_WEBHOOK_EVENTS = {
  // Incoming text message
  textMessage: (overrides?: Partial<WhatsAppMessage>) => ({
    object: 'whatsapp_business_account',
    entry: [{
      id: '123456789',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15551234567', phone_number_id: '123456' },
          contacts: [{ profile: { name: 'John Doe' }, wa_id: '14155551234' }],
          messages: [{
            from: '14155551234',
            id: 'wamid.abc123',
            timestamp: String(Math.floor(Date.now() / 1000)),
            text: { body: 'Hello, I need help with my room' },
            type: 'text',
            ...overrides,
          }],
        },
        field: 'messages',
      }],
    }],
  }),

  // Incoming image message
  imageMessage: (mediaId: string = 'media_123') => ({
    object: 'whatsapp_business_account',
    entry: [{
      id: '123456789',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15551234567', phone_number_id: '123456' },
          contacts: [{ profile: { name: 'John Doe' }, wa_id: '14155551234' }],
          messages: [{
            from: '14155551234',
            id: 'wamid.img123',
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'image',
            image: {
              caption: 'Look at this issue',
              mime_type: 'image/jpeg',
              sha256: 'abc123hash',
              id: mediaId,
            },
          }],
        },
        field: 'messages',
      }],
    }],
  }),

  // Message status update
  statusUpdate: (status: 'sent' | 'delivered' | 'read', messageId: string) => ({
    object: 'whatsapp_business_account',
    entry: [{
      id: '123456789',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15551234567', phone_number_id: '123456' },
          statuses: [{
            id: messageId,
            status,
            timestamp: String(Math.floor(Date.now() / 1000)),
            recipient_id: '14155551234',
          }],
        },
        field: 'messages',
      }],
    }],
  }),
};
```

### MSW Handlers

```typescript
// tests/mocks/whatsapp/handlers.ts
import { rest } from 'msw';
import { WHATSAPP_MOCK_RESPONSES } from './responses';

export const whatsappHandlers = [
  // Send message
  rest.post(
    'https://graph.facebook.com/:version/:phoneNumberId/messages',
    async (req, res, ctx) => {
      const body = await req.json();

      // Simulate errors based on content
      if (body.to === 'invalid') {
        return res(ctx.status(400), ctx.json(WHATSAPP_MOCK_RESPONSES.errors.invalidPhone));
      }

      return res(ctx.json(WHATSAPP_MOCK_RESPONSES.sendMessage));
    }
  ),

  // Upload media
  rest.post(
    'https://graph.facebook.com/:version/:phoneNumberId/media',
    (req, res, ctx) => {
      return res(ctx.json(WHATSAPP_MOCK_RESPONSES.uploadMedia));
    }
  ),

  // Get media URL
  rest.get(
    'https://graph.facebook.com/:version/:mediaId',
    (req, res, ctx) => {
      return res(ctx.json(WHATSAPP_MOCK_RESPONSES.getMediaUrl));
    }
  ),
];
```

---

## Twilio API Mocks

### Mock Responses

```typescript
// tests/mocks/twilio/responses.ts

export const TWILIO_MOCK_RESPONSES = {
  // Send SMS
  sendSms: {
    sid: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    date_created: 'Thu, 30 Jul 2024 20:12:31 +0000',
    date_updated: 'Thu, 30 Jul 2024 20:12:31 +0000',
    date_sent: null,
    account_sid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    to: '+14155551234',
    from: '+15551234567',
    messaging_service_sid: null,
    body: 'Hello from Jack!',
    status: 'queued',
    num_segments: '1',
    direction: 'outbound-api',
    api_version: '2010-04-01',
    price: null,
    price_unit: 'USD',
    error_code: null,
    error_message: null,
    uri: '/2010-04-01/Accounts/ACxxx/Messages/SMxxx.json',
  },

  // Message status callback
  statusCallback: (status: string) => ({
    MessageSid: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    MessageStatus: status,
    To: '+14155551234',
    From: '+15551234567',
    ErrorCode: null,
    ErrorMessage: null,
  }),

  // Errors
  errors: {
    invalidNumber: {
      code: 21211,
      message: 'The \'To\' number +1invalid is not a valid phone number.',
      more_info: 'https://www.twilio.com/docs/errors/21211',
      status: 400,
    },
    unverified: {
      code: 21608,
      message: 'The number +14155551234 is unverified.',
      status: 400,
    },
  },
};
```

### Webhook Fixtures

```typescript
// tests/mocks/twilio/webhooks.ts

export const TWILIO_WEBHOOK_EVENTS = {
  // Incoming SMS
  incomingSms: (overrides?: Record<string, string>) => ({
    ToCountry: 'US',
    ToState: 'CA',
    SmsMessageSid: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    NumMedia: '0',
    ToCity: 'SAN FRANCISCO',
    FromZip: '94105',
    SmsSid: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    FromState: 'CA',
    SmsStatus: 'received',
    FromCity: 'SAN FRANCISCO',
    Body: 'I need extra towels please',
    FromCountry: 'US',
    To: '+15551234567',
    ToZip: '94107',
    NumSegments: '1',
    MessageSid: 'SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    From: '+14155551234',
    ApiVersion: '2010-04-01',
    ...overrides,
  }),

  // Incoming MMS (with media)
  incomingMms: (mediaUrl: string) => ({
    ...TWILIO_WEBHOOK_EVENTS.incomingSms(),
    NumMedia: '1',
    MediaContentType0: 'image/jpeg',
    MediaUrl0: mediaUrl,
  }),

  // Status callback
  statusCallback: (status: string, messageId: string) => ({
    SmsSid: messageId,
    SmsStatus: status,
    MessageStatus: status,
    To: '+14155551234',
    MessageSid: messageId,
    AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    From: '+15551234567',
    ApiVersion: '2010-04-01',
  }),
};
```

---

## PMS API Mocks

### Mock Data

```typescript
// tests/mocks/pms/data.ts

export const PMS_MOCK_DATA = {
  // Guest reservation
  reservation: (overrides?: Partial<Reservation>) => ({
    id: 'RES123456',
    confirmationNumber: 'CONF123',
    guestId: 'GUEST789',
    guestName: 'John Doe',
    guestEmail: 'john.doe@example.com',
    guestPhone: '+14155551234',
    roomNumber: '401',
    roomType: 'Deluxe King',
    checkInDate: '2024-01-15',
    checkOutDate: '2024-01-18',
    adults: 2,
    children: 0,
    status: 'confirmed',
    specialRequests: 'Late checkout requested',
    loyaltyTier: 'gold',
    totalAmount: 599.97,
    currency: 'USD',
    createdAt: '2024-01-01T10:00:00Z',
    updatedAt: '2024-01-10T14:30:00Z',
    ...overrides,
  }),

  // Room status
  roomStatus: (roomNumber: string, status: string = 'clean') => ({
    roomNumber,
    status,               // 'clean', 'dirty', 'inspected', 'out_of_order'
    occupancyStatus: 'occupied',
    guestName: 'John Doe',
    checkoutDate: '2024-01-18',
    housekeepingNotes: null,
    lastUpdated: new Date().toISOString(),
  }),

  // Guest profile
  guestProfile: (overrides?: Partial<GuestProfile>) => ({
    id: 'GUEST789',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+14155551234',
    dateOfBirth: '1985-06-15',
    nationality: 'US',
    loyaltyNumber: 'GOLD123456',
    loyaltyTier: 'gold',
    totalStays: 12,
    totalNights: 45,
    preferences: {
      roomType: 'King',
      floorPreference: 'high',
      pillowType: 'firm',
      newspaper: 'Wall Street Journal',
      dietaryRestrictions: ['vegetarian'],
    },
    vipStatus: false,
    notes: 'Prefers quiet room away from elevator',
    ...overrides,
  }),

  // Folio/billing
  folio: (reservationId: string) => ({
    reservationId,
    folioNumber: 'FOL123456',
    balance: 125.50,
    currency: 'USD',
    charges: [
      { date: '2024-01-15', description: 'Room Charge', amount: 199.99, category: 'accommodation' },
      { date: '2024-01-15', description: 'Room Service', amount: 45.00, category: 'food_beverage' },
      { date: '2024-01-16', description: 'Spa Treatment', amount: 150.00, category: 'spa' },
    ],
    payments: [
      { date: '2024-01-15', method: 'Credit Card', amount: 269.49, reference: 'PAY123' },
    ],
  }),
};
```

### MSW Handlers

```typescript
// tests/mocks/pms/handlers.ts
import { rest } from 'msw';
import { PMS_MOCK_DATA } from './data';

export const pmsHandlers = [
  // Get reservation by confirmation number
  rest.get('http://pms-api/reservations/:confirmationNumber', (req, res, ctx) => {
    const { confirmationNumber } = req.params;
    return res(ctx.json(PMS_MOCK_DATA.reservation({ confirmationNumber: confirmationNumber as string })));
  }),

  // Get reservation by room number
  rest.get('http://pms-api/rooms/:roomNumber/reservation', (req, res, ctx) => {
    const { roomNumber } = req.params;
    return res(ctx.json(PMS_MOCK_DATA.reservation({ roomNumber: roomNumber as string })));
  }),

  // Get guest profile
  rest.get('http://pms-api/guests/:guestId', (req, res, ctx) => {
    const { guestId } = req.params;
    return res(ctx.json(PMS_MOCK_DATA.guestProfile({ id: guestId as string })));
  }),

  // Get room status
  rest.get('http://pms-api/rooms/:roomNumber/status', (req, res, ctx) => {
    const { roomNumber } = req.params;
    return res(ctx.json(PMS_MOCK_DATA.roomStatus(roomNumber as string)));
  }),

  // Update room status (housekeeping request)
  rest.patch('http://pms-api/rooms/:roomNumber/status', async (req, res, ctx) => {
    const body = await req.json();
    return res(ctx.json({ success: true, ...body }));
  }),

  // Get folio
  rest.get('http://pms-api/reservations/:reservationId/folio', (req, res, ctx) => {
    const { reservationId } = req.params;
    return res(ctx.json(PMS_MOCK_DATA.folio(reservationId as string)));
  }),

  // Post charge
  rest.post('http://pms-api/reservations/:reservationId/charges', async (req, res, ctx) => {
    const body = await req.json();
    return res(ctx.json({
      chargeId: 'CHG' + Date.now(),
      ...body,
      posted: true,
      postedAt: new Date().toISOString(),
    }));
  }),
];
```

---

## AI Provider Mocks

### Claude API Mock

```typescript
// tests/mocks/ai/claude.ts

export const CLAUDE_MOCK_RESPONSES = {
  // Text completion
  completion: (content: string = 'I can help you with that request.') => ({
    id: 'msg_01XFDUDYJgAACzvnptvVoYEL',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content }],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 25, output_tokens: 20 },
  }),

  // Tool use response
  toolUse: (toolName: string, toolInput: Record<string, unknown>) => ({
    id: 'msg_tool_123',
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'tool_use',
      id: 'toolu_01A09q90qw90lq917835lhlPq',
      name: toolName,
      input: toolInput,
    }],
    model: 'claude-sonnet-4-20250514',
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50 },
  }),

  // Streaming chunks
  streamChunks: (content: string) => {
    const words = content.split(' ');
    return words.map((word, i) => ({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: (i > 0 ? ' ' : '') + word },
    }));
  },

  // Errors
  errors: {
    rateLimited: {
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'Rate limit exceeded',
      },
    },
    overloaded: {
      type: 'error',
      error: {
        type: 'overloaded_error',
        message: 'The model is temporarily overloaded',
      },
    },
  },
};

// MSW handler
export const claudeHandler = rest.post(
  'https://api.anthropic.com/v1/messages',
  async (req, res, ctx) => {
    const body = await req.json();

    // Simulate rate limiting
    if (body.messages?.[0]?.content?.includes('RATE_LIMIT_TEST')) {
      return res(ctx.status(429), ctx.json(CLAUDE_MOCK_RESPONSES.errors.rateLimited));
    }

    // Return completion
    return res(ctx.json(CLAUDE_MOCK_RESPONSES.completion()));
  }
);
```

### OpenAI API Mock

```typescript
// tests/mocks/ai/openai.ts

export const OPENAI_MOCK_RESPONSES = {
  // Chat completion
  chatCompletion: (content: string = 'I can help you with that.') => ({
    id: 'chatcmpl-abc123',
    object: 'chat.completion',
    created: Date.now(),
    model: 'gpt-4o',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 25, completion_tokens: 20, total_tokens: 45 },
  }),

  // Embedding
  embedding: (dimensions: number = 512) => ({
    object: 'list',
    data: [{
      object: 'embedding',
      index: 0,
      embedding: Array(dimensions).fill(0).map(() => Math.random() - 0.5),
    }],
    model: 'text-embedding-3-small',
    usage: { prompt_tokens: 10, total_tokens: 10 },
  }),

  // Function call
  functionCall: (name: string, args: Record<string, unknown>) => ({
    id: 'chatcmpl-func123',
    object: 'chat.completion',
    model: 'gpt-4o',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        function_call: { name, arguments: JSON.stringify(args) },
      },
      finish_reason: 'function_call',
    }],
  }),
};

export const openaiHandler = rest.post(
  'https://api.openai.com/v1/chat/completions',
  async (req, res, ctx) => {
    return res(ctx.json(OPENAI_MOCK_RESPONSES.chatCompletion()));
  }
);

export const openaiEmbeddingHandler = rest.post(
  'https://api.openai.com/v1/embeddings',
  async (req, res, ctx) => {
    return res(ctx.json(OPENAI_MOCK_RESPONSES.embedding()));
  }
);
```

---

## Test Fixtures

### Database Fixtures

```typescript
// tests/fixtures/database.ts

import Database from 'better-sqlite3';
import { migrate } from '@/db/migrate';

export async function createTestDatabase(): Promise<Database.Database> {
  const db = new Database(':memory:');
  await migrate(db);
  return db;
}

export async function seedTestData(db: Database.Database): Promise<TestData> {
  // Create test staff
  const staff = db.prepare(`
    INSERT INTO staff (id, email, name, role, department, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('staff_test1', 'test@hotel.com', 'Test Staff', 'front_desk', 'front_office', 'available');

  // Create test guest
  const guest = db.prepare(`
    INSERT INTO guests (id, name, email, phone, channel, channel_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('guest_test1', 'John Doe', 'john@example.com', '+14155551234', 'whatsapp', 'wa_123');

  // Create test conversation
  const conversation = db.prepare(`
    INSERT INTO conversations (id, guest_id, channel, status, started_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run('conv_test1', 'guest_test1', 'whatsapp', 'active');

  // Create test messages
  db.prepare(`
    INSERT INTO messages (id, conversation_id, direction, content, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run('msg_test1', 'conv_test1', 'inbound', 'Hello, I need help');

  return {
    staffId: 'staff_test1',
    guestId: 'guest_test1',
    conversationId: 'conv_test1',
    messageId: 'msg_test1',
  };
}

export function cleanupTestDatabase(db: Database.Database): void {
  db.exec(`
    DELETE FROM messages;
    DELETE FROM conversations;
    DELETE FROM guests;
    DELETE FROM staff;
    DELETE FROM tasks;
  `);
}
```

### Factory Functions

```typescript
// tests/fixtures/factories.ts

export const factories = {
  guest: (overrides?: Partial<Guest>): Guest => ({
    id: `guest_${nanoid(10)}`,
    name: 'Test Guest',
    email: 'guest@example.com',
    phone: '+14155551234',
    channel: 'whatsapp',
    channelId: `wa_${nanoid(10)}`,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  conversation: (overrides?: Partial<Conversation>): Conversation => ({
    id: `conv_${nanoid(10)}`,
    guestId: `guest_${nanoid(10)}`,
    channel: 'whatsapp',
    status: 'active',
    startedAt: new Date(),
    lastMessageAt: new Date(),
    messageCount: 0,
    ...overrides,
  }),

  message: (overrides?: Partial<Message>): Message => ({
    id: `msg_${nanoid(10)}`,
    conversationId: `conv_${nanoid(10)}`,
    direction: 'inbound',
    content: 'Test message content',
    createdAt: new Date(),
    ...overrides,
  }),

  task: (overrides?: Partial<Task>): Task => ({
    id: `task_${nanoid(10)}`,
    type: 'housekeeping',
    status: 'pending',
    priority: 'normal',
    description: 'Test task',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  staff: (overrides?: Partial<Staff>): Staff => ({
    id: `staff_${nanoid(10)}`,
    email: 'staff@hotel.com',
    name: 'Test Staff',
    role: 'front_desk',
    department: 'front_office',
    status: 'available',
    createdAt: new Date(),
    ...overrides,
  }),
};
```

---

## Test Setup

### Global Test Setup

```typescript
// tests/setup.ts
import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { whatsappHandlers } from './mocks/whatsapp/handlers';
import { twilioHandlers } from './mocks/twilio/handlers';
import { pmsHandlers } from './mocks/pms/handlers';
import { claudeHandler, openaiHandler } from './mocks/ai';

// Create MSW server with all handlers
export const server = setupServer(
  ...whatsappHandlers,
  ...twilioHandlers,
  ...pmsHandlers,
  claudeHandler,
  openaiHandler
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
```

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/**', '**/*.d.ts'],
      thresholds: {
        global: {
          statements: 70,
          branches: 70,
          functions: 70,
          lines: 70,
        },
      },
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
```

---

## Example Test

```typescript
// tests/services/message-handler.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { server } from '@tests/setup';
import { rest } from 'msw';
import { MessageHandler } from '@/services/message-handler';
import { createTestDatabase, seedTestData } from '@tests/fixtures/database';
import { WHATSAPP_WEBHOOK_EVENTS } from '@tests/mocks/whatsapp/webhooks';
import { CLAUDE_MOCK_RESPONSES } from '@tests/mocks/ai/claude';

describe('MessageHandler', () => {
  let db: Database;
  let handler: MessageHandler;
  let testData: TestData;

  beforeEach(async () => {
    db = await createTestDatabase();
    testData = await seedTestData(db);
    handler = new MessageHandler(db);
  });

  it('should process incoming WhatsApp message', async () => {
    const webhook = WHATSAPP_WEBHOOK_EVENTS.textMessage({
      text: { body: 'I need more towels' },
    });

    const result = await handler.processWebhook('whatsapp', webhook);

    expect(result.processed).toBe(true);
    expect(result.messageId).toBeDefined();

    // Verify message saved
    const message = db.prepare('SELECT * FROM messages WHERE id = ?')
      .get(result.messageId);
    expect(message.content).toBe('I need more towels');
  });

  it('should generate AI response', async () => {
    // Override Claude response for this test
    server.use(
      rest.post('https://api.anthropic.com/v1/messages', (req, res, ctx) => {
        return res(ctx.json(CLAUDE_MOCK_RESPONSES.completion(
          'I\'ll arrange for extra towels to be sent to your room right away.'
        )));
      })
    );

    const response = await handler.generateResponse(testData.conversationId, 'I need towels');

    expect(response.content).toContain('towels');
    expect(response.source).toBe('ai');
  });

  it('should handle AI rate limiting gracefully', async () => {
    server.use(
      rest.post('https://api.anthropic.com/v1/messages', (req, res, ctx) => {
        return res(ctx.status(429), ctx.json(CLAUDE_MOCK_RESPONSES.errors.rateLimited));
      })
    );

    const response = await handler.generateResponse(testData.conversationId, 'Hello');

    // Should fall back to template or escalate
    expect(response.source).toBe('fallback');
  });
});
```

---

## Related

- [Testing Strategy](testing-strategy.md) - Overall testing approach
- [Health Checks](../04-specs/api/health-checks.md) - Health check testing
- [Project Structure](../04-specs/project-structure.md) - Test file locations
