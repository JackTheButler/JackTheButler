export { PERMISSIONS, WILDCARD_PERMISSION } from './permissions.js';
export type { Permission } from './permissions.js';

export type { ConversationState } from './conversation.js';
export type { TaskStatus, TaskPriority } from './task.js';
export type { ReservationStatus } from './reservation.js';

// Channel types
export type {
  ChannelType,
  ContentType,
  SendResult,
  InboundMessage,
  OutboundMessage,
  ChannelAdapter,
} from './channel.js';

// AI types
export type {
  MessageRole,
  CompletionMessage,
  ModelTier,
  CompletionRequest,
  TokenUsage,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  AIProvider,
} from './ai.js';

// PMS types
export { IntegrationSources } from './pms.js';
export type {
  IntegrationSource,
  GuestPreference,
  NormalizedGuest,
  NormalizedReservation,
  RoomStatus,
  NormalizedRoom,
  PMSEventType,
  PMSEvent,
  ReservationQuery,
  PMSAdapter,
  SyncResult,
} from './pms.js';

// App manifest system + plugin utilities
export type {
  AppLogger,
  PluginContext,
  AppCategory,
  ProviderStatus,
  ConfigFieldType,
  ConfigField,
  ConnectionTestResult,
  BaseProvider,
  AppManifest,
  AIAppManifest,
  ChannelAppManifest,
  PMSAppManifest,
  ToolAppManifest,
  AnyAppManifest,
  AppInstance,
} from './apps.js';

export { withLogContext, AppLogError } from './apps.js';
