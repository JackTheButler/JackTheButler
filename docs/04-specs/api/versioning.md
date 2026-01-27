# API Versioning Specification

This document defines the API versioning strategy for Jack The Butler.

---

## Overview

Jack uses URL-based versioning with a clear deprecation policy to ensure API stability while allowing evolution.

---

## Versioning Scheme

### URL Format

```
https://api.jackthebutler.com/v{major}/{resource}
```

Examples:
- `GET /v1/conversations`
- `POST /v1/messages`
- `GET /v2/guests/{id}`

### Version Components

| Component | When Incremented |
|-----------|------------------|
| **Major** (v1, v2) | Breaking changes |
| **Minor** | New features (backward compatible) - not in URL |
| **Patch** | Bug fixes - not in URL |

Minor and patch versions are communicated via response headers, not URL.

---

## Breaking vs Non-Breaking Changes

### Breaking Changes (Require Major Version Bump)

- Removing an endpoint
- Removing a required field from request
- Removing a field from response
- Changing field type (e.g., string to number)
- Changing field format (e.g., date format)
- Renaming a field
- Changing authentication mechanism
- Changing error response structure
- Changing HTTP method for an endpoint
- Changing URL path structure

### Non-Breaking Changes (No Version Bump Required)

- Adding new endpoints
- Adding optional fields to request
- Adding new fields to response
- Adding new enum values (when client ignores unknown)
- Adding new error codes
- Performance improvements
- Bug fixes that don't change contract

---

## Version Lifecycle

### States

```
┌──────────┐     ┌──────────┐     ┌────────────┐     ┌──────────┐
│  Alpha   │ ──▶ │   Beta   │ ──▶ │   Stable   │ ──▶ │Deprecated│
└──────────┘     └──────────┘     └────────────┘     └──────────┘
                                         │
                                         ▼
                                  ┌──────────┐
                                  │  Sunset  │
                                  └──────────┘
```

| State | Description | Support |
|-------|-------------|---------|
| **Alpha** | Early development, may change | No guarantees |
| **Beta** | Feature complete, stabilizing | Limited support |
| **Stable** | Production ready | Full support |
| **Deprecated** | Scheduled for removal | Security fixes only |
| **Sunset** | Removed | None |

### Timeline

- **Minimum stable period**: 12 months before deprecation
- **Deprecation notice**: 6 months before sunset
- **Deprecation period**: 6 months minimum
- **Total support**: 18 months minimum per major version

---

## Response Headers

Every API response includes version information:

```http
HTTP/1.1 200 OK
X-API-Version: 1.4.2
X-API-Deprecated: false
X-API-Sunset-Date:
Content-Type: application/json
```

When using a deprecated version:

```http
HTTP/1.1 200 OK
X-API-Version: 1.4.2
X-API-Deprecated: true
X-API-Sunset-Date: 2025-06-01
X-API-Deprecation-Info: https://docs.jackthebutler.com/api/migration/v1-to-v2
Warning: 299 - "API version v1 is deprecated. Please migrate to v2 before 2025-06-01"
Content-Type: application/json
```

---

## Version Negotiation

### Default Version

If no version specified, requests go to the latest stable version:

```http
GET /conversations
→ Redirects to /v1/conversations (or latest stable)
```

### Explicit Version

Always prefer explicit version:

```http
GET /v1/conversations
```

### Version Header (Alternative)

For clients that cannot modify URLs:

```http
GET /conversations
X-API-Version: 1
```

URL version takes precedence over header.

---

## Deprecation Process

### Step 1: Announce Deprecation

```typescript
// Add deprecation notice to responses
interface DeprecationNotice {
  version: string;
  deprecatedAt: string;        // ISO date
  sunsetAt: string;            // ISO date
  migrationGuide: string;      // URL to migration docs
  replacementEndpoint?: string; // New endpoint if applicable
}
```

### Step 2: Log Usage

```typescript
// Track deprecated endpoint usage
async function trackDeprecatedUsage(
  endpoint: string,
  version: string,
  clientId: string
): Promise<void> {
  await db.deprecationUsage.upsert({
    endpoint,
    version,
    clientId,
    lastUsed: new Date(),
    count: sql`count + 1`,
  });
}
```

### Step 3: Notify Clients

```typescript
// Send deprecation notifications
async function notifyDeprecation(version: string): Promise<void> {
  const clients = await db.deprecationUsage.findByVersion(version);

  for (const client of clients) {
    await emailService.send({
      to: client.contactEmail,
      template: 'api-deprecation-notice',
      data: {
        version,
        sunsetDate: version.sunsetAt,
        migrationGuide: version.migrationGuide,
        usageCount: client.count,
      },
    });
  }
}
```

### Step 4: Return Errors After Sunset

```typescript
// After sunset date
function versionMiddleware(ctx: Context, next: Next) {
  const version = extractVersion(ctx.path);
  const versionInfo = getVersionInfo(version);

  if (versionInfo.status === 'sunset') {
    ctx.status = 410; // Gone
    ctx.body = {
      error: 'VERSION_SUNSET',
      message: `API version ${version} has been sunset`,
      migrationGuide: versionInfo.migrationGuide,
      currentVersion: getCurrentStableVersion(),
    };
    return;
  }

  return next();
}
```

---

## Migration Support

### Migration Guides

Each major version change includes:

1. **Changelog** - Detailed list of all changes
2. **Migration guide** - Step-by-step upgrade instructions
3. **Code examples** - Before/after code samples
4. **Compatibility layer** - Optional shim for gradual migration

### Compatibility Headers

Request old response format from new version:

```http
GET /v2/guests/123
Accept: application/json; version=1
```

This returns v2 data transformed to v1 format (when possible).

---

## Implementation

### Version Router

```typescript
import { Hono } from 'hono';

const app = new Hono();

// Version 1 routes
const v1 = new Hono();
v1.route('/conversations', conversationsV1);
v1.route('/messages', messagesV1);
v1.route('/guests', guestsV1);

// Version 2 routes (future)
const v2 = new Hono();
v2.route('/conversations', conversationsV2);
v2.route('/messages', messagesV2);
v2.route('/guests', guestsV2);

// Mount versions
app.route('/v1', v1);
app.route('/v2', v2);

// Default redirect to latest
app.get('/*', (ctx) => {
  const path = ctx.req.path;
  return ctx.redirect(`/v1${path}`, 307);
});
```

### Version Middleware

```typescript
function versionMiddleware() {
  return async (ctx: Context, next: Next) => {
    const version = extractVersion(ctx.req.path);
    const versionInfo = VERSION_REGISTRY[version];

    if (!versionInfo) {
      ctx.status = 400;
      ctx.body = { error: 'INVALID_VERSION', availableVersions: ['v1'] };
      return;
    }

    // Add version info to context
    ctx.set('apiVersion', versionInfo);

    // Add headers to response
    ctx.header('X-API-Version', versionInfo.fullVersion);
    ctx.header('X-API-Deprecated', String(versionInfo.deprecated));

    if (versionInfo.deprecated) {
      ctx.header('X-API-Sunset-Date', versionInfo.sunsetDate);
      ctx.header('X-API-Deprecation-Info', versionInfo.migrationGuide);
      ctx.header('Warning', `299 - "API ${version} deprecated, sunset ${versionInfo.sunsetDate}"`);

      // Track usage
      await trackDeprecatedUsage(ctx.req.path, version, ctx.get('clientId'));
    }

    await next();
  };
}
```

### Version Registry

```typescript
interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
  fullVersion: string;
  status: 'alpha' | 'beta' | 'stable' | 'deprecated' | 'sunset';
  releasedAt: string;
  deprecatedAt?: string;
  sunsetAt?: string;
  migrationGuide?: string;
}

const VERSION_REGISTRY: Record<string, VersionInfo> = {
  v1: {
    major: 1,
    minor: 0,
    patch: 0,
    fullVersion: '1.0.0',
    status: 'stable',
    releasedAt: '2024-01-01',
  },
};

function getCurrentStableVersion(): string {
  return Object.entries(VERSION_REGISTRY)
    .filter(([_, info]) => info.status === 'stable')
    .sort((a, b) => b[1].major - a[1].major)[0][0];
}
```

---

## Backward Compatibility Guarantees

### What We Guarantee

For stable versions:

1. **Endpoints remain available** until sunset
2. **Required fields don't change** type or format
3. **Response fields don't disappear** without deprecation
4. **Error codes remain consistent**
5. **Authentication methods remain valid**

### What We Don't Guarantee

1. **Response field order** - Always access by name, not position
2. **Additional fields** - New fields may appear in responses
3. **Whitespace/formatting** - JSON formatting may change
4. **Performance characteristics** - Response times may vary
5. **Undocumented behavior** - Only documented behavior is guaranteed

---

## Client Best Practices

### Do

```typescript
// Use explicit version
const API_VERSION = 'v1';
const baseUrl = `https://api.jackthebutler.com/${API_VERSION}`;

// Ignore unknown fields
interface Guest {
  id: string;
  name: string;
  // Don't fail if response has extra fields
  [key: string]: unknown;
}

// Check deprecation headers
const response = await fetch(url);
if (response.headers.get('X-API-Deprecated') === 'true') {
  logger.warn('Using deprecated API version', {
    sunsetDate: response.headers.get('X-API-Sunset-Date'),
  });
}
```

### Don't

```typescript
// Don't rely on field order
const [id, name] = Object.values(guest); // Bad!

// Don't use undocumented endpoints
await fetch('/internal/debug'); // Bad!

// Don't parse error messages
if (error.message.includes('not found')) // Bad!
// Use error codes instead
if (error.code === 'NOT_FOUND') // Good!
```

---

## Configuration

```yaml
api:
  versioning:
    # Current versions
    versions:
      v1:
        status: stable
        fullVersion: "1.0.0"

    # Default version for unversioned requests
    defaultVersion: v1

    # Deprecation settings
    deprecation:
      noticeMonths: 6          # Months before sunset to announce
      minimumStableMonths: 12  # Minimum time a version stays stable
      trackUsage: true         # Track deprecated endpoint usage
      notifyClients: true      # Email clients about deprecation

    # Headers
    headers:
      includeVersion: true
      includeDeprecation: true
```

---

## Related

- [Gateway API](gateway-api.md) - API endpoints
- [Authentication](authentication.md) - Auth mechanisms
- [Error Handling](../../05-operations/error-handling.md) - Error codes
