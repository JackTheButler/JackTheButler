# Feature Flags Specification

This document defines the feature flag system for Jack The Butler.

---

## Overview

Feature flags enable runtime control of features without code deployment. Jack's feature flag system supports:
- Static flags (config file)
- Dynamic flags (database)
- Property-level overrides
- Gradual rollouts

---

## Flag Storage

### Configuration File (Default)

Static flags defined in configuration:

```yaml
# config/features.yaml
features:
  # Core features
  aiResponses: true
  multiLanguage: true
  sentimentAnalysis: true

  # Channels
  whatsapp: true
  sms: true
  email: true
  webchat: true
  voice: false                    # Coming soon

  # Integrations
  pmsSync: true
  posIntegration: false

  # Experimental
  proactiveNotifications: true
  guestMemory: true
  smartRouting: true

  # Beta features
  voiceTranscription: false
  imageAnalysis: false
```

### Database (Dynamic)

For flags that change at runtime:

```sql
CREATE TABLE feature_flags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  rollout_percentage INTEGER DEFAULT 100,  -- For gradual rollouts
  conditions JSON,                          -- Targeting rules
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES staff(id)
);

CREATE TABLE feature_flag_overrides (
  id TEXT PRIMARY KEY,
  flag_name TEXT NOT NULL REFERENCES feature_flags(name),
  target_type TEXT NOT NULL CHECK (target_type IN ('property', 'staff', 'guest')),
  target_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT REFERENCES staff(id),

  UNIQUE(flag_name, target_type, target_id)
);
```

---

## Flag Evaluation

### Evaluation Order

Flags are evaluated in this order (first match wins):

1. **Override** - Specific override for target (property/staff/guest)
2. **Database** - Dynamic flag value
3. **Config** - Static configuration
4. **Default** - Built-in default (false)

### Implementation

```typescript
interface FeatureContext {
  propertyId?: string;
  staffId?: string;
  guestId?: string;
  sessionId?: string;
}

class FeatureFlagService {
  private configFlags: Record<string, boolean>;
  private cache = new LRUCache<string, boolean>({ max: 1000, ttl: 60000 });

  constructor(
    private db: Database,
    private config: Config
  ) {
    this.configFlags = config.features || {};
  }

  async isEnabled(flagName: string, context?: FeatureContext): Promise<boolean> {
    // Check cache first
    const cacheKey = this.getCacheKey(flagName, context);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const value = await this.evaluate(flagName, context);
    this.cache.set(cacheKey, value);
    return value;
  }

  private async evaluate(flagName: string, context?: FeatureContext): Promise<boolean> {
    // 1. Check overrides
    if (context) {
      const override = await this.checkOverrides(flagName, context);
      if (override !== null) {
        return override;
      }
    }

    // 2. Check database flag
    const dbFlag = await this.getDbFlag(flagName);
    if (dbFlag) {
      // Check rollout percentage
      if (dbFlag.rollout_percentage < 100 && context?.sessionId) {
        const hash = this.hashString(`${flagName}:${context.sessionId}`);
        if ((hash % 100) >= dbFlag.rollout_percentage) {
          return false;
        }
      }

      // Check conditions
      if (dbFlag.conditions && context) {
        if (!this.matchesConditions(dbFlag.conditions, context)) {
          return false;
        }
      }

      return dbFlag.enabled === 1;
    }

    // 3. Check config
    if (flagName in this.configFlags) {
      return this.configFlags[flagName];
    }

    // 4. Default
    return false;
  }

  private async checkOverrides(
    flagName: string,
    context: FeatureContext
  ): Promise<boolean | null> {
    // Check in order: property, staff, guest
    const targets = [
      { type: 'guest', id: context.guestId },
      { type: 'staff', id: context.staffId },
      { type: 'property', id: context.propertyId },
    ].filter(t => t.id);

    for (const target of targets) {
      const override = await this.db.prepare(`
        SELECT enabled FROM feature_flag_overrides
        WHERE flag_name = ? AND target_type = ? AND target_id = ?
      `).get(flagName, target.type, target.id);

      if (override) {
        return override.enabled === 1;
      }
    }

    return null;
  }

  private matchesConditions(
    conditions: FlagConditions,
    context: FeatureContext
  ): boolean {
    // Example conditions:
    // { "staffRoles": ["admin", "manager"] }
    // { "loyaltyTiers": ["gold", "platinum"] }

    // Implement condition matching logic
    return true;
  }

  private getCacheKey(flagName: string, context?: FeatureContext): string {
    if (!context) return flagName;
    return `${flagName}:${context.propertyId || ''}:${context.staffId || ''}:${context.guestId || ''}`;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
```

---

## Flag Types

### Boolean Flags (Simple)

```typescript
if (await features.isEnabled('webchat')) {
  // Show webchat widget
}
```

### Percentage Rollout

```typescript
// Gradually roll out to 25% of sessions
const flag = await features.getFlag('newAIModel');
// flag.rollout_percentage = 25
```

### Conditional Flags

```yaml
# Only enable for specific conditions
proactiveNotifications:
  enabled: true
  conditions:
    loyaltyTiers:
      - gold
      - platinum
    staffRoles:
      - concierge
```

### Time-Based Flags

```yaml
# Enable during specific periods
holidayGreeting:
  enabled: true
  conditions:
    startDate: "2024-12-20"
    endDate: "2025-01-02"
```

---

## Flag Management API

### List Flags

```http
GET /api/v1/admin/features
Authorization: Bearer {admin_token}
```

Response:
```json
{
  "flags": [
    {
      "name": "webchat",
      "description": "Enable web chat widget",
      "enabled": true,
      "source": "config",
      "rolloutPercentage": 100
    },
    {
      "name": "voiceTranscription",
      "description": "Transcribe voice messages",
      "enabled": false,
      "source": "database",
      "rolloutPercentage": 10
    }
  ]
}
```

### Update Flag

```http
PUT /api/v1/admin/features/{flagName}
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "enabled": true,
  "rolloutPercentage": 50,
  "conditions": {
    "staffRoles": ["admin", "manager"]
  }
}
```

### Create Override

```http
POST /api/v1/admin/features/{flagName}/overrides
Authorization: Bearer {admin_token}
Content-Type: application/json

{
  "targetType": "property",
  "targetId": "HOTEL01",
  "enabled": true
}
```

### Delete Override

```http
DELETE /api/v1/admin/features/{flagName}/overrides/{overrideId}
Authorization: Bearer {admin_token}
```

---

## Flag Change Handling

### Without Restart

Database flags take effect immediately. Config flags require restart unless using hot-reload:

```typescript
// Watch config file for changes
class ConfigWatcher {
  private watcher: FSWatcher;

  start(): void {
    this.watcher = watch('config/features.yaml', async (event) => {
      if (event === 'change') {
        await this.reloadConfig();
        logger.info('Feature flags reloaded');
      }
    });
  }

  private async reloadConfig(): Promise<void> {
    const newConfig = await loadConfig('config/features.yaml');
    featureService.updateConfigFlags(newConfig.features);

    // Clear cache to pick up new values
    featureService.clearCache();

    // Emit event for components to react
    eventBus.emit(EventType.FEATURE_FLAGS_CHANGED, {
      timestamp: new Date(),
    });
  }
}
```

### Component Reaction

```typescript
// Components listen for flag changes
eventBus.on(EventType.FEATURE_FLAGS_CHANGED, async () => {
  // Re-evaluate relevant flags
  const webchatEnabled = await features.isEnabled('webchat');

  if (!webchatEnabled && webchatServer.isRunning()) {
    await webchatServer.shutdown();
  } else if (webchatEnabled && !webchatServer.isRunning()) {
    await webchatServer.start();
  }
});
```

---

## Usage Patterns

### Guard Routes

```typescript
function featureGuard(flagName: string) {
  return async (ctx: Context, next: Next) => {
    const enabled = await features.isEnabled(flagName, {
      staffId: ctx.state.user?.id,
    });

    if (!enabled) {
      ctx.status = 404;
      ctx.body = { error: 'Feature not available' };
      return;
    }

    await next();
  };
}

// Usage
router.post('/voice-messages', featureGuard('voiceTranscription'), handleVoiceMessage);
```

### Component Rendering

```typescript
// React example
function Dashboard() {
  const { isEnabled } = useFeatureFlags();

  return (
    <div>
      <ConversationList />

      {isEnabled('analytics') && (
        <AnalyticsPanel />
      )}

      {isEnabled('proactiveNotifications') && (
        <NotificationScheduler />
      )}
    </div>
  );
}
```

### Conditional Logic

```typescript
async function processMessage(message: InboundMessage): Promise<Response> {
  // Check if AI responses are enabled
  if (!await features.isEnabled('aiResponses')) {
    // Forward directly to staff
    return escalateToStaff(message);
  }

  // Check if sentiment analysis is enabled
  const includeSentiment = await features.isEnabled('sentimentAnalysis');

  const response = await aiEngine.process(message, {
    analyzeSentiment: includeSentiment,
  });

  return response;
}
```

---

## Built-in Flags

### Core Flags

| Flag | Default | Description |
|------|---------|-------------|
| `aiResponses` | true | Enable AI-generated responses |
| `multiLanguage` | true | Auto-detect and respond in guest's language |
| `sentimentAnalysis` | true | Analyze message sentiment |
| `guestMemory` | true | Remember guest preferences |
| `smartRouting` | true | AI-powered task routing |

### Channel Flags

| Flag | Default | Description |
|------|---------|-------------|
| `whatsapp` | true | WhatsApp channel |
| `sms` | true | SMS channel |
| `email` | true | Email channel |
| `webchat` | true | Web chat widget |
| `voice` | false | Voice channel (future) |

### Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `proactiveNotifications` | true | Send automated notifications |
| `imageAnalysis` | false | Analyze images in messages |
| `voiceTranscription` | false | Transcribe voice messages |
| `a11yMode` | false | Enhanced accessibility |

---

## Audit Trail

All flag changes are logged:

```typescript
interface FlagChangeAudit {
  id: string;
  flagName: string;
  action: 'enable' | 'disable' | 'update' | 'override_create' | 'override_delete';
  previousValue?: any;
  newValue?: any;
  changedBy: string;
  changedAt: Date;
  reason?: string;
}

async function updateFlag(
  flagName: string,
  updates: FlagUpdates,
  updatedBy: string,
  reason?: string
): Promise<void> {
  const previous = await getFlag(flagName);

  await db.featureFlags.update(flagName, updates);

  // Audit log
  await db.auditLog.create({
    id: generateId('audit'),
    action: 'feature_flag.update',
    actorId: updatedBy,
    resourceType: 'feature_flag',
    resourceId: flagName,
    changes: [
      { field: 'enabled', oldValue: previous.enabled, newValue: updates.enabled },
    ],
    metadata: { reason },
  });
}
```

---

## Configuration Summary

```yaml
featureFlags:
  # Storage
  storage:
    config: config/features.yaml
    database: true               # Enable database flags

  # Caching
  cache:
    enabled: true
    ttl: 60000                   # 1 minute

  # Hot reload
  hotReload:
    enabled: true
    watchConfig: true

  # Defaults
  defaultEnabled: false          # Default for unknown flags

  # Audit
  audit:
    enabled: true
    retention: 90                # Days to keep audit logs

  # API
  api:
    enabled: true
    requireAdmin: true           # Require admin role
```

---

## Related

- [Configuration](configuration.md) - General configuration
- [Gateway API](../04-specs/api/gateway-api.md) - API endpoints
- [Audit Logging](logging.md) - Audit trail
