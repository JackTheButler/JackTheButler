# Code Style Guide

This document defines the code style conventions for Jack The Butler.

---

## Overview

Consistent code style improves readability and maintainability. Jack uses:
- **TypeScript** with strict mode
- **oxlint** for linting
- **Prettier** for formatting

---

## TypeScript Conventions

### Use `interface` for Object Types

```typescript
// Good - use interface for object shapes
interface Guest {
  id: string;
  name: string;
  email: string;
}

// Good - use interface for extending
interface VipGuest extends Guest {
  loyaltyTier: string;
  vipStatus: true;
}

// Good - use type for unions, intersections, primitives
type GuestStatus = 'active' | 'inactive' | 'archived';
type GuestId = string;
type GuestWithStatus = Guest & { status: GuestStatus };

// Avoid - don't use type for simple object shapes
type Guest = {
  id: string;
  name: string;
};
```

### Naming Conventions

```typescript
// Interfaces: PascalCase, noun
interface ConversationService {}
interface MessageHandler {}
interface GuestRepository {}

// Types: PascalCase
type ChannelType = 'whatsapp' | 'sms' | 'email';
type Priority = 'low' | 'normal' | 'high' | 'urgent';

// Classes: PascalCase, noun
class WhatsAppAdapter {}
class GuestService {}
class MessageQueue {}

// Functions: camelCase, verb
function sendMessage() {}
function processWebhook() {}
function validateRequest() {}

// Variables: camelCase
const guestProfile = {};
const messageCount = 0;
const isActive = true;

// Constants: SCREAMING_SNAKE_CASE
const MAX_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 5000;
const API_VERSION = 'v1';

// Enums: PascalCase for name, PascalCase for values
enum ConversationStatus {
  Active = 'active',
  Escalated = 'escalated',
  Resolved = 'resolved',
  Closed = 'closed',
}

// Private class members: no prefix (use #)
class Service {
  #privateField: string;

  #privateMethod() {}
}
```

### Database Field Naming

```typescript
// Database columns: snake_case
// TypeScript properties: camelCase
// Use mapping in repository layer

// SQL schema
CREATE TABLE guests (
  id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  created_at TEXT
);

// TypeScript interface
interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
}

// Repository handles mapping
class GuestRepository {
  async findById(id: string): Promise<Guest | null> {
    const row = await this.db.prepare(
      'SELECT * FROM guests WHERE id = ?'
    ).get(id);

    if (!row) return null;

    return {
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      createdAt: new Date(row.created_at),
    };
  }
}
```

---

## Async/Await

### Always Use async/await

```typescript
// Good - async/await
async function processMessage(message: Message): Promise<Response> {
  const guest = await guestService.findById(message.guestId);
  const intent = await aiEngine.classifyIntent(message.content);
  const response = await generateResponse(guest, intent);
  return response;
}

// Avoid - Promise chains
function processMessage(message: Message): Promise<Response> {
  return guestService.findById(message.guestId)
    .then(guest => aiEngine.classifyIntent(message.content)
      .then(intent => generateResponse(guest, intent)));
}

// Avoid - callbacks
function processMessage(message: Message, callback: (err: Error, response: Response) => void) {
  guestService.findById(message.guestId, (err, guest) => {
    if (err) return callback(err);
    // ...
  });
}
```

### Parallel Execution

```typescript
// Good - parallel when independent
async function loadConversationData(conversationId: string) {
  const [conversation, messages, guest] = await Promise.all([
    conversationService.findById(conversationId),
    messageService.findByConversation(conversationId),
    guestService.findByConversation(conversationId),
  ]);

  return { conversation, messages, guest };
}

// Good - sequential when dependent
async function processAndNotify(taskId: string) {
  const task = await taskService.complete(taskId);
  await notificationService.notifyGuest(task.guestId, task); // Depends on task
}

// Avoid - sequential when could be parallel
async function loadData(id: string) {
  const a = await serviceA.find(id);
  const b = await serviceB.find(id); // Doesn't depend on a
  const c = await serviceC.find(id); // Doesn't depend on a or b
}
```

---

## Error Handling

### Custom Error Classes

```typescript
// Base error class
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific error classes
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(
      `${resource} not found`,
      'NOT_FOUND',
      404,
      { resource, id }
    );
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fields?: Array<{ field: string; message: string }>) {
    super(message, 'VALIDATION_ERROR', 400, { fields });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}
```

### Error Handling Patterns

```typescript
// Good - specific errors with context
async function findGuest(id: string): Promise<Guest> {
  const guest = await db.guests.findById(id);
  if (!guest) {
    throw new NotFoundError('Guest', id);
  }
  return guest;
}

// Good - wrap external errors
async function sendWhatsAppMessage(to: string, content: string): Promise<void> {
  try {
    await whatsappApi.send({ to, text: content });
  } catch (error) {
    throw new ChannelError('whatsapp', 'Failed to send message', {
      originalError: error.message,
      to,
    });
  }
}

// Good - handle specific errors
async function processRequest(req: Request): Promise<Response> {
  try {
    return await handler(req);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return { status: 404, body: { error: error.message } };
    }
    if (error instanceof ValidationError) {
      return { status: 400, body: { error: error.message, details: error.details } };
    }
    // Re-throw unknown errors
    throw error;
  }
}
```

---

## Import Organization

### Import Order

```typescript
// 1. Node.js built-in modules
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// 2. External packages (alphabetical)
import { Hono } from 'hono';
import { z } from 'zod';

// 3. Internal absolute imports (alphabetical by path)
import { AppError } from '@/errors';
import { GuestService } from '@/services/guest';
import { logger } from '@/utils/logger';

// 4. Relative imports (parent first, then siblings)
import { BaseAdapter } from '../base-adapter';
import { formatMessage } from './utils';

// 5. Type-only imports (last)
import type { Context } from 'hono';
import type { Guest, Message } from '@/types';
```

### Import Style

```typescript
// Good - named imports
import { GuestService, StaffService } from '@/services';
import { logger, formatDate } from '@/utils';

// Good - namespace import for many exports
import * as schema from '@/db/schema';

// Good - default import when appropriate
import Database from 'better-sqlite3';

// Avoid - mixing default and named unnecessarily
import React, { useState, useEffect } from 'react';
// Prefer
import { useState, useEffect } from 'react';

// Avoid - importing everything
import * as utils from '@/utils'; // Only if using many exports
```

---

## Function Definitions

### Parameter Handling

```typescript
// Good - destructure objects
function createGuest({ name, email, phone }: CreateGuestParams): Guest {
  return { id: generateId('guest'), name, email, phone };
}

// Good - optional parameters with defaults
function paginate(items: Item[], { limit = 20, offset = 0 }: PaginateOptions = {}): Item[] {
  return items.slice(offset, offset + limit);
}

// Good - rest parameters for variadic
function log(level: string, message: string, ...meta: unknown[]): void {
  console.log(level, message, ...meta);
}

// Avoid - too many positional parameters
function createTask(type, subtype, priority, department, description, roomNumber, guestId) {}
// Prefer
function createTask(params: CreateTaskParams): Task {}
```

### Return Types

```typescript
// Good - explicit return types for public functions
export async function findGuest(id: string): Promise<Guest | null> {
  return db.guests.findById(id);
}

// Good - return type can be inferred for simple private functions
function calculateScore(guest: Guest) {
  return guest.totalStays * 10 + guest.loyaltyPoints;
}

// Good - use void for functions that don't return
async function logEvent(event: Event): Promise<void> {
  await db.events.insert(event);
}

// Avoid - returning undefined explicitly
function findItem(id: string): Item | undefined {
  return items.find(i => i.id === id);
}
// Prefer - use null for "not found"
function findItem(id: string): Item | null {
  return items.find(i => i.id === id) ?? null;
}
```

---

## Comments

### When to Comment

```typescript
// Good - explain WHY, not WHAT
// Using setTimeout instead of setInterval to prevent drift
// when handler takes longer than interval
function scheduleJob(handler: () => Promise<void>, intervalMs: number): void {
  const run = async () => {
    await handler();
    setTimeout(run, intervalMs);
  };
  run();
}

// Good - document complex algorithms
/**
 * Calculates staff routing score using weighted factors:
 * - Workload (40%): Lower utilization = higher score
 * - Skills (30%): Better skill match = higher score
 * - Response time (20%): Faster average = higher score
 * - Availability (10%): More available hours = higher score
 */
function calculateRoutingScore(staff: Staff, requirements: Requirements): number {
  // ...
}

// Good - explain non-obvious business rules
// VIP guests always get priority routing regardless of queue position
// per agreement with hotel management (see JIRA-1234)
if (guest.vipStatus) {
  return escalateToManager(conversation);
}

// Avoid - obvious comments
// Get the guest
const guest = await getGuest(id);

// Avoid - commented-out code (use git history)
// const oldImplementation = () => { ... };
```

### JSDoc for Public APIs

```typescript
/**
 * Sends a message to a guest through their preferred channel.
 *
 * @param guestId - The unique identifier of the guest
 * @param content - The message content to send
 * @param options - Optional configuration for the message
 * @returns The sent message with delivery status
 * @throws {NotFoundError} If guest doesn't exist
 * @throws {ChannelError} If message delivery fails
 *
 * @example
 * ```typescript
 * const message = await sendMessage('guest_123', 'Your room is ready!', {
 *   priority: 'high',
 *   template: 'room_ready'
 * });
 * ```
 */
export async function sendMessage(
  guestId: string,
  content: string,
  options?: SendMessageOptions
): Promise<Message> {
  // ...
}
```

---

## File Structure

### Single Responsibility

```typescript
// Good - one main export per file
// src/services/guest.ts
export class GuestService {
  // ...
}

// Related types can be in the same file
export interface CreateGuestParams {
  name: string;
  email: string;
}

// Avoid - multiple unrelated exports
// src/services/index.ts
export class GuestService {}
export class StaffService {}
export class TaskService {}
// Instead, have separate files and re-export from index
```

### File Organization

```
src/
├── services/
│   ├── guest.ts           # GuestService class
│   ├── guest.test.ts      # Tests adjacent to source
│   ├── staff.ts
│   ├── staff.test.ts
│   └── index.ts           # Re-exports
├── types/
│   ├── guest.ts           # Guest-related types
│   ├── message.ts         # Message-related types
│   └── index.ts           # Re-exports all types
└── utils/
    ├── date.ts            # Date utilities
    ├── validation.ts      # Validation utilities
    └── index.ts           # Re-exports
```

---

## Configuration Files

### oxlint.json

```json
{
  "rules": {
    "no-unused-vars": "error",
    "no-console": "warn",
    "prefer-const": "error",
    "no-var": "error",
    "eqeqeq": "error"
  },
  "ignorePatterns": [
    "dist/",
    "node_modules/",
    "*.config.js"
  ]
}
```

### .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Best Practices Summary

| Category | Do | Don't |
|----------|-----|-------|
| Types | Use `interface` for objects | Use `type` for simple objects |
| Naming | `camelCase` for variables | `snake_case` for JS variables |
| Async | Use `async`/`await` | Use Promise chains |
| Errors | Throw custom error classes | Throw strings |
| Imports | Organize by category | Mix import styles |
| Comments | Explain why | Explain what |
| Files | One responsibility per file | Multiple unrelated exports |

---

## Related

- [Project Structure](../project-structure.md) - Directory layout
- [Testing Strategy](../../05-operations/testing-strategy.md) - Test conventions
- [Logging](../../05-operations/logging.md) - Log formatting
