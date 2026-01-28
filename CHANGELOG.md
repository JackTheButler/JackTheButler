# Changelog

All notable changes to Jack The Butler are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - Phase 8b: Admin Console

#### Integration Layer Restructuring
- Created `src/integrations/core/` with registry pattern for all integrations
- Defined `IntegrationDefinition` and `ProviderDefinition` types
- Central registry with AI, Channels (WhatsApp, SMS, Email, WebChat), and PMS integrations
- Each provider has configurable schema with field types (text, password, select, boolean)

#### Integration Configuration Storage
- New `integration_configs` table for storing provider configurations
- New `integration_logs` table for tracking integration events
- AES-256-GCM encryption for sensitive credentials (API keys, tokens)
- Credential masking for API responses

#### Integration Management API
- `GET /api/v1/integrations` - List all integrations with status
- `GET /api/v1/integrations/:id` - Get integration details with config schema
- `GET /api/v1/integrations/registry` - Get static registry (available integrations)
- `PUT /api/v1/integrations/:id/providers/:providerId` - Update provider config
- `DELETE /api/v1/integrations/:id/providers/:providerId` - Delete provider config
- `POST /api/v1/integrations/:id/providers/:providerId/test` - Test connection
- `POST /api/v1/integrations/:id/providers/:providerId/toggle` - Enable/disable
- `GET /api/v1/integrations/:id/logs` - Get integration event logs

#### Connection Testing
- AI providers: Tests API key with minimal request
- WhatsApp (Meta): Validates access token with Graph API
- SMS (Twilio/Vonage): Tests account credentials
- Email (SMTP/Mailgun/SendGrid): Tests sender configuration

#### Integration Management UI
- New Integrations list page with category grouping
- Stats cards showing connected/configured/error/total counts
- Search functionality across integrations and providers
- Integration cards with status badges and provider icons

#### Integration Edit Page
- Provider selection with visual indicators
- Dynamic configuration forms based on provider schema
- Password fields with show/hide toggle
- Connection test with animated spinner and result feedback
- Activity logs showing recent events
- Enable/disable toggle for providers
- Danger zone for removing configurations

#### UI Components (shadcn/ui)
- Button component with variants (default, outline, destructive)
- Card, CardHeader, CardContent, CardTitle components
- Badge component with success/warning/error/secondary variants
- Input, Label, Switch components
- IntegrationIcon component mapping IDs to Lucide icons or custom SVGs

#### Custom Icons
- Added custom SVG icons: whatsapp, twilio, mailgun, wechat, messenger, brain, email, smartphone, building, chat-round
- Icon mapping for integrations and providers

#### Automation Management API
- `GET /api/v1/automation/rules` - List all automation rules
- `GET /api/v1/automation/rules/:ruleId` - Get specific rule details
- `POST /api/v1/automation/rules` - Create new automation rule
- `PUT /api/v1/automation/rules/:ruleId` - Update automation rule
- `DELETE /api/v1/automation/rules/:ruleId` - Delete automation rule
- `POST /api/v1/automation/rules/:ruleId/toggle` - Enable/disable rule
- `POST /api/v1/automation/rules/:ruleId/test` - Test rule configuration
- `GET /api/v1/automation/rules/:ruleId/logs` - Get rule execution logs
- `GET /api/v1/automation/logs` - Get all automation logs
- `GET /api/v1/automation/templates` - Get available message templates

#### Automation Management UI
- Automations list page with search and filter by trigger type
- Stats cards showing active/inactive/error/total counts
- Rule cards with enable/disable toggle switch
- Trigger type badges (Scheduled, Event)
- Action type display (Send Message, Create Task, Notify Staff, Webhook)
- Run count and last run timestamp display
- Error state display with alert styling

#### Automation Edit Page
- Create new and edit existing automation rules
- Trigger type selection (Time-based, Event-based)
- Dynamic trigger configuration forms:
  - Time-based: timing type, offset days, execution time
  - Event-based: event type selection
- Action type selection with dynamic configuration:
  - Send Message: template selection, channel override
  - Create Task: title, department, priority
  - Notify Staff: message, channel
  - Webhook: URL, HTTP method, headers
- Activity logs display with status badges
- Test button for validating rule configuration
- Danger zone for rule deletion

### Fixed
- Masked credential values (containing `*`) no longer overwrite actual values on save
- Whitespace trimming on config values
- Updated Anthropic model options to current valid IDs (claude-sonnet-4, claude-opus-4, claude-3-5-haiku)

### Added - Phase 8c: Channel & Automation Polish

#### Automation Engine
- Created `automation_rules` and `automation_logs` database tables
- Implemented `AutomationEngine` with rule evaluation and scheduling
- Time-based triggers (scheduled execution with cron-like patterns)
- Event-based triggers (message received, check-in, task created, etc.)
- Actions: send_message, create_task, notify_staff, webhook
- Rule CRUD operations and execution logging

#### SMS Channel (Twilio)
- Full SMS adapter with Twilio API integration
- Webhook endpoints with signature verification
- Inbound message processing through AI pipeline
- Status callback handling for delivery tracking
- TwiML responses for Twilio compatibility

#### Email Channel (IMAP)
- Email receiver with IMAP polling for incoming messages
- Email parser using mailparser for RFC 5322 parsing
- Reply content extraction (strips quoted text)
- Email sender with SMTP/Mailgun/SendGrid support
- HTML templates for outgoing emails
- Email adapter connected to message processor
- Auto-start on server startup with graceful shutdown

#### Escalation Manager
- Sentiment analysis using pattern-based detection
- Repetition detection with Jaccard similarity
- VIP guest priority handling (gold/platinum tiers)
- Explicit human request detection (regex patterns)
- Multi-signal escalation decision with confidence scoring
- Automatic conversation state updates on escalation
- Event emission for real-time dashboard updates

---

## [0.8.0] - 2026-01-28

### Added - Phase 7: PMS Integration

#### PMS Adapter Interface
- Created normalized types for all PMS data (`NormalizedGuest`, `NormalizedReservation`, `NormalizedRoom`)
- Implemented `PMSAdapter` interface that all PMS providers must implement
- Created `MockPMSAdapter` with seeded test data for development
- Added PMS webhook endpoints for inbound data push:
  - `POST /webhooks/pms/guests` - Guest updates
  - `POST /webhooks/pms/reservations` - Reservation updates
  - `POST /webhooks/pms/events` - Generic PMS events (check-in, check-out, etc.)
  - `POST /webhooks/pms/mews` - Mews-specific endpoint
  - `POST /webhooks/pms/cloudbeds` - Cloudbeds-specific endpoint

#### Sync Service
- Created `PMSSyncService` for synchronizing PMS data to local database
- Implemented `Scheduler` service with configurable periodic sync job
- Added PMS configuration options (`PMS_PROVIDER`, `PMS_SYNC_INTERVAL`, etc.)
- Scheduler status now included in `/health` endpoint
- Admin API endpoints for manual sync:
  - `GET /api/v1/admin/scheduler` - View scheduler status
  - `POST /api/v1/admin/sync/pms` - Trigger manual PMS sync
  - `POST /api/v1/admin/scheduler/:jobName/trigger` - Trigger specific job

#### Guest Matching
- Created `GuestContextService` for matching conversations to guests and reservations
- Automatic phone number matching on WhatsApp/SMS messages
- Conversations now linked to both guest profiles and active reservations

#### Context-Aware AI Responses
- AI responder now includes guest profile in system prompts
- Guest context includes: name, loyalty tier, VIP status, preferences
- Reservation context includes: room number, check-in status, special requests, stay duration
- AI instructed to personalize responses using guest's first name

#### Dashboard Guest Panel
- Added `GET /api/v1/conversations/:id/guest` endpoint
- Returns full guest context (profile + reservation) for dashboard display

### Changed
- Updated version to 0.8.0
- Message processor now includes guest matching step (7-step pipeline)
- Health endpoint includes scheduler job status

---

## [0.7.0] - 2026-01-27

### Added - Phase 6: Operations Dashboard

#### Dashboard Foundation
- React dashboard application (`apps/dashboard/`)
- Authentication UI with JWT login
- Protected routes with auth context

#### Conversation Management
- Conversation list view with filters (state, assignment)
- Conversation detail view with real-time messages
- Staff can send messages through dashboard
- WebSocket integration for real-time updates

#### Task Management
- Task list view with filters (status, department, assignment)
- Task creation and assignment
- Task status updates (claim, complete, cancel)

---

## [0.6.0] - 2026-01-26

### Added - Phase 5: WhatsApp Integration

#### WhatsApp Channel Adapter
- `WhatsAppAdapter` implementing Meta Cloud API
- Webhook verification for Meta webhook setup
- Inbound message parsing from Meta webhook format
- Outbound message sending via Cloud API
- Signature verification for webhook security

#### Message Pipeline
- `MessageProcessor` for central message handling
- `Responder` interface with AI and Echo implementations
- Conversation service for managing chat sessions
- Guest identification by phone number

#### WebSocket Server
- Real-time WebSocket connections for dashboard
- Broadcast capability for conversation updates
- Connection management and heartbeat

---

## [0.5.0] - 2026-01-25

### Added - Phase 4: AI Engine

#### LLM Provider Abstraction
- `LLMProvider` interface for multiple AI providers
- Claude (Anthropic) provider implementation
- OpenAI provider implementation
- Ollama (local) provider implementation
- Automatic provider selection based on configuration

#### Intent Classification
- `IntentClassifier` for understanding guest requests
- Department routing (housekeeping, maintenance, concierge, etc.)
- Action detection for service requests

#### Knowledge Base (RAG)
- `KnowledgeService` with vector embeddings
- sqlite-vec integration for similarity search
- Knowledge item CRUD operations
- Context retrieval for AI responses

#### AI Responder
- `AIResponder` combining intent + knowledge + LLM
- System prompt with hotel butler personality
- Conversation history context
- Knowledge base context injection

---

## [0.4.0] - 2026-01-24

### Added - Phase 3: Core Services

#### Guest Service
- Guest profile management
- Phone number normalization (E.164)
- Guest lookup by phone, email, ID
- Guest creation and updates

#### Task Service
- Service request management
- Task creation, assignment, completion
- Priority and status tracking
- Department routing

#### Conversation Service
- Conversation lifecycle management
- Message storage and retrieval
- State transitions (new, active, escalated, resolved)
- Staff assignment

---

## [0.3.0] - 2026-01-23

### Added - Phase 2: Database & API Foundation

#### Database
- SQLite with better-sqlite3
- Drizzle ORM integration
- WAL mode for concurrency
- Migration system

#### Schema
- `guests` table - Guest profiles
- `reservations` table - Booking data
- `conversations` table - Chat sessions
- `messages` table - Message history
- `tasks` table - Service requests
- `staff` table - Hotel staff
- `knowledge_items` table - AI knowledge base

#### Gateway Server
- Hono HTTP framework
- Health check endpoints (`/health/live`, `/health/ready`)
- Error handling middleware
- Request logging middleware
- JWT authentication middleware

---

## [0.2.0] - 2026-01-22

### Added - Phase 1: Project Setup

#### Project Structure
- TypeScript configuration with strict mode
- Path aliases (`@/` for src)
- pnpm workspace setup
- Development tooling (tsx, vitest)

#### Configuration
- Environment variable loading
- Zod schema validation
- Multi-environment support (development, test, production)

#### Logging
- Pino logger with structured JSON output
- Component-based log prefixes
- Log level configuration

#### Testing
- Vitest test runner
- Test utilities and helpers
- In-memory SQLite for tests

---

## [0.1.0] - 2026-01-21

### Added
- Initial project scaffolding
- Basic documentation structure
- Git repository setup
