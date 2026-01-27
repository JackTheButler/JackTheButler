# Authentication Specification

This document defines all authentication mechanisms for Jack The Butler.

---

## Overview

Jack uses multiple authentication methods depending on the client type:

| Client Type | Method | Token Lifetime |
|-------------|--------|----------------|
| Staff Dashboard | JWT with refresh tokens | Access: 15min, Refresh: 7 days |
| Staff Mobile App | JWT with refresh tokens | Access: 15min, Refresh: 30 days |
| WebSocket | JWT (same as HTTP) | Validated on connect |
| External Webhooks | API Key + Signature | No expiration |
| Internal Services | Service tokens | 1 hour, auto-refresh |

---

## JWT Authentication

### Token Structure

#### Access Token

Short-lived token for API requests.

```typescript
interface AccessTokenPayload {
  // Standard claims
  sub: string;           // Staff ID (staff_xxx)
  iat: number;           // Issued at (Unix timestamp)
  exp: number;           // Expiration (Unix timestamp)
  jti: string;           // Unique token ID (for revocation)

  // Custom claims
  email: string;
  name: string;
  role: StaffRole;
  permissions: Permission[];
  sessionId: string;     // Links to refresh token
}

type StaffRole =
  | 'admin'
  | 'manager'
  | 'front_desk'
  | 'concierge'
  | 'housekeeping'
  | 'maintenance';

type Permission =
  | 'conversations:read'
  | 'conversations:write'
  | 'conversations:assign'
  | 'tasks:read'
  | 'tasks:write'
  | 'tasks:assign'
  | 'guests:read'
  | 'guests:write'
  | 'knowledge:read'
  | 'knowledge:write'
  | 'settings:read'
  | 'settings:write'
  | 'staff:read'
  | 'staff:write'
  | 'analytics:read';
```

#### Refresh Token

Long-lived token stored securely, used only to obtain new access tokens.

```typescript
interface RefreshTokenPayload {
  sub: string;           // Staff ID
  iat: number;
  exp: number;
  jti: string;           // Unique token ID
  sessionId: string;     // Session identifier
  deviceId: string;      // Device fingerprint
  clientType: 'dashboard' | 'mobile';
}
```

### Token Expiration

| Token Type | Lifetime | Configurable |
|------------|----------|--------------|
| Access Token | 15 minutes | Yes (5-60 min) |
| Refresh Token (Dashboard) | 7 days | Yes (1-30 days) |
| Refresh Token (Mobile) | 30 days | Yes (7-90 days) |

```yaml
# config/auth.yaml
auth:
  jwt:
    accessTokenTTL: 900         # 15 minutes in seconds
    refreshTokenTTL:
      dashboard: 604800         # 7 days
      mobile: 2592000           # 30 days

    # Grace period for token refresh (allows refresh slightly after expiry)
    refreshGracePeriod: 300     # 5 minutes
```

---

## Authentication Flows

### Login Flow

```
┌──────────┐          ┌──────────┐          ┌──────────┐
│  Client  │          │  Gateway │          │    DB    │
└────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │
     │ POST /auth/login    │                     │
     │ {email, password}   │                     │
     │────────────────────>│                     │
     │                     │                     │
     │                     │ Verify credentials  │
     │                     │────────────────────>│
     │                     │                     │
     │                     │ Create session      │
     │                     │────────────────────>│
     │                     │                     │
     │ {accessToken,       │                     │
     │  refreshToken,      │                     │
     │  user}              │                     │
     │<────────────────────│                     │
     │                     │                     │
```

#### Login Endpoint

```http
POST /auth/login
Content-Type: application/json

{
  "email": "staff@hotel.com",
  "password": "securePassword123",
  "deviceId": "d4e5f6g7-h8i9-j0k1-l2m3-n4o5p6q7r8s9",
  "clientType": "dashboard"
}
```

**Response (Success):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900,
  "tokenType": "Bearer",
  "user": {
    "id": "staff_V1StGXR8_Z5jdHi6B-myT",
    "email": "staff@hotel.com",
    "name": "Maria Garcia",
    "role": "front_desk",
    "permissions": [
      "conversations:read",
      "conversations:write",
      "tasks:read",
      "tasks:write",
      "guests:read"
    ]
  }
}
```

**Response (Failure):**
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

**Rate Limiting:**
- 5 attempts per email per 15 minutes
- After 5 failures: 15-minute lockout
- After 10 failures: account locked (requires admin reset)

### Token Refresh Flow

```
┌──────────┐          ┌──────────┐          ┌──────────┐
│  Client  │          │  Gateway │          │    DB    │
└────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │
     │ POST /auth/refresh  │                     │
     │ {refreshToken}      │                     │
     │────────────────────>│                     │
     │                     │                     │
     │                     │ Validate token      │
     │                     │ Check not revoked   │
     │                     │────────────────────>│
     │                     │                     │
     │                     │ Rotate refresh      │
     │                     │ token (optional)    │
     │                     │────────────────────>│
     │                     │                     │
     │ {accessToken,       │                     │
     │  refreshToken}      │                     │
     │<────────────────────│                     │
     │                     │                     │
```

#### Refresh Endpoint

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response (Success):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900,
  "tokenType": "Bearer"
}
```

**Response (Token Expired/Invalid):**
```json
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Refresh token has expired. Please log in again."
  }
}
```

**Refresh Token Rotation:**
- Each refresh issues a new refresh token
- Old refresh token is invalidated
- Prevents token replay attacks
- If old token is used after rotation → all sessions for user are revoked (security measure)

### Logout Flow

#### Single Device Logout

```http
POST /auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Actions:**
1. Add access token `jti` to revocation list
2. Delete refresh token from database
3. Terminate WebSocket connections for this session

#### All Devices Logout

```http
POST /auth/logout-all
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out from all devices",
  "sessionsTerminated": 3
}
```

**Actions:**
1. Revoke all refresh tokens for user
2. Add all active access tokens to revocation list
3. Terminate all WebSocket connections for user

---

## Session Management

### Session Storage

```typescript
interface Session {
  id: string;                    // sess_xxx
  staffId: string;               // staff_xxx
  deviceId: string;              // Client-provided device fingerprint
  clientType: 'dashboard' | 'mobile';
  refreshTokenHash: string;      // Hashed refresh token
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  ip: string;
  userAgent: string;
  isActive: boolean;
}
```

### Database Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id),
  device_id TEXT NOT NULL,
  client_type TEXT NOT NULL CHECK (client_type IN ('dashboard', 'mobile')),
  refresh_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,

  UNIQUE(staff_id, device_id)
);

CREATE INDEX idx_sessions_staff ON sessions(staff_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);
```

### Multi-Device Handling

Each device gets its own session. Users can:

1. **View active sessions:**
```http
GET /auth/sessions
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Response:**
```json
{
  "sessions": [
    {
      "id": "sess_V1StGXR8_Z5jdHi6B-myT",
      "deviceId": "d4e5f6g7-h8i9-j0k1-l2m3-n4o5p6q7r8s9",
      "clientType": "dashboard",
      "createdAt": "2024-01-10T08:00:00Z",
      "lastActivityAt": "2024-01-15T10:30:00Z",
      "ip": "192.168.1.100",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
      "isCurrent": true
    },
    {
      "id": "sess_xYz123AbC456dEf789gHi",
      "deviceId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "clientType": "mobile",
      "createdAt": "2024-01-12T14:00:00Z",
      "lastActivityAt": "2024-01-14T18:45:00Z",
      "ip": "10.0.0.50",
      "userAgent": "JackButler/1.0 (iOS 17.2)",
      "isCurrent": false
    }
  ]
}
```

2. **Revoke specific session:**
```http
DELETE /auth/sessions/{sessionId}
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

### Session Limits

```yaml
auth:
  sessions:
    maxPerUser: 5              # Maximum concurrent sessions
    maxPerDeviceType:
      dashboard: 2             # Max browser sessions
      mobile: 3                # Max mobile app sessions
```

When limit exceeded: Oldest session is automatically terminated.

---

## Token Revocation

### Revocation List

Short-lived tokens can't be truly revoked without checking a list. We maintain an in-memory revocation list for active tokens.

```typescript
interface TokenRevocation {
  jti: string;                   // Token ID
  revokedAt: Date;
  expiresAt: Date;               // When to remove from list
  reason: RevocationReason;
}

type RevocationReason =
  | 'logout'
  | 'logout_all'
  | 'password_change'
  | 'permission_change'
  | 'admin_revoke'
  | 'security_concern';
```

### Implementation

```typescript
import { LRUCache } from 'lru-cache';

// In-memory revocation list (survives for token lifetime)
const revokedTokens = new LRUCache<string, TokenRevocation>({
  max: 10000,
  ttl: 3600000,  // 1 hour (longer than access token lifetime)
});

function revokeToken(jti: string, reason: RevocationReason, expiresAt: Date): void {
  revokedTokens.set(jti, {
    jti,
    revokedAt: new Date(),
    expiresAt,
    reason,
  });
}

function isTokenRevoked(jti: string): boolean {
  return revokedTokens.has(jti);
}

// Middleware to check revocation
async function validateToken(token: string): Promise<TokenPayload> {
  const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;

  if (isTokenRevoked(payload.jti)) {
    throw new AuthError('TOKEN_REVOKED', 'Token has been revoked');
  }

  return payload;
}
```

### Automatic Revocation Triggers

| Event | Action |
|-------|--------|
| Password change | Revoke all tokens except current |
| Role/permission change | Revoke all tokens (force re-login) |
| Account deactivation | Revoke all tokens |
| Security alert | Revoke all tokens |

---

## JWT Secret Management

### Secret Requirements

```typescript
const JWT_SECRET_REQUIREMENTS = {
  minLength: 64,                 // Minimum 64 characters
  algorithm: 'HS256',            // HMAC SHA-256
  encoding: 'base64',            // Secret encoding
};
```

### Secret Storage

```bash
# Environment variable (required)
JWT_SECRET=base64_encoded_secret_at_least_64_characters_long

# For rotation, support two secrets
JWT_SECRET_CURRENT=base64_encoded_current_secret
JWT_SECRET_PREVIOUS=base64_encoded_previous_secret  # Optional, for rotation
```

### Secret Rotation

Rotation allows changing secrets without invalidating all sessions.

```typescript
interface JWTSecrets {
  current: string;               // Used for signing new tokens
  previous?: string;             // Accepted for verification (grace period)
  rotatedAt?: Date;              // When rotation occurred
  previousExpiresAt?: Date;      // When to stop accepting previous
}

// Sign with current secret
function signToken(payload: object): string {
  return jwt.sign(payload, secrets.current, { algorithm: 'HS256' });
}

// Verify with current, fall back to previous
function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, secrets.current) as TokenPayload;
  } catch (err) {
    if (secrets.previous && err.name === 'JsonWebTokenError') {
      return jwt.verify(token, secrets.previous) as TokenPayload;
    }
    throw err;
  }
}
```

### Rotation Process

1. Generate new secret
2. Set as `JWT_SECRET_CURRENT`
3. Move old secret to `JWT_SECRET_PREVIOUS`
4. Deploy changes
5. Wait for all access tokens to expire (15 min + buffer)
6. Remove `JWT_SECRET_PREVIOUS`

```yaml
# Recommended rotation schedule
auth:
  jwt:
    rotationSchedule: "0 0 1 */3 *"  # Quarterly, 1st of month at midnight
    previousSecretTTL: 86400          # Keep previous for 24 hours
```

---

## API Key Authentication

For external webhooks and integrations.

### API Key Format

```
jack_{environment}_{type}_{random}

Examples:
jack_live_sk_V1StGXR8Z5jdHi6BmyTxYz123AbC456
jack_test_sk_AbC123dEf456gHi789jKlMnOpQrStUv
jack_live_pk_publicKeyForClientSideOnly12345
```

| Component | Description |
|-----------|-------------|
| `jack` | Prefix for all keys |
| `live`/`test` | Environment |
| `sk`/`pk` | Secret key / Public key |
| Random | 32 character random string |

### API Key Storage

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,           -- ak_xxx
  key_hash TEXT NOT NULL,        -- SHA-256 hash of full key
  key_prefix TEXT NOT NULL,      -- First 12 chars for identification
  name TEXT NOT NULL,            -- Human-readable name
  environment TEXT NOT NULL CHECK (environment IN ('live', 'test')),
  key_type TEXT NOT NULL CHECK (key_type IN ('secret', 'public')),
  permissions JSON NOT NULL,     -- Allowed operations
  created_by TEXT REFERENCES staff(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  expires_at TEXT,               -- Optional expiration
  is_active INTEGER NOT NULL DEFAULT 1,

  UNIQUE(key_hash)
);

CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

### API Key Usage

```http
POST /webhooks/whatsapp
X-API-Key: jack_live_sk_V1StGXR8Z5jdHi6BmyTxYz123AbC456
Content-Type: application/json

{...webhook payload...}
```

### Webhook Signature Verification

For additional security, webhooks include a signature:

```http
X-Jack-Signature: sha256=abc123...
X-Jack-Timestamp: 1705312200
```

```typescript
function verifyWebhookSignature(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  // Check timestamp is recent (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Math.abs(now - ts) > 300) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature.replace('sha256=', '')),
    Buffer.from(expected)
  );
}
```

---

## Service-to-Service Authentication

For internal communication between Jack components.

### Service Tokens

```typescript
interface ServiceToken {
  sub: string;                   // Service name
  iat: number;
  exp: number;
  scope: string[];               // Allowed operations
}

// Short-lived, auto-refreshed
const SERVICE_TOKEN_TTL = 3600;  // 1 hour
```

### Service Authentication Flow

```typescript
class ServiceAuthClient {
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  async getToken(): Promise<string> {
    // Refresh if expired or expiring soon (5 min buffer)
    if (Date.now() / 1000 > this.tokenExpiresAt - 300) {
      await this.refreshToken();
    }
    return this.token!;
  }

  private async refreshToken(): Promise<void> {
    const response = await fetch('/internal/auth/token', {
      method: 'POST',
      headers: {
        'X-Service-Secret': process.env.SERVICE_SECRET,
        'X-Service-Name': process.env.SERVICE_NAME,
      },
    });

    const { token, expiresAt } = await response.json();
    this.token = token;
    this.tokenExpiresAt = expiresAt;
  }
}
```

---

## Password Requirements

### Password Policy

```typescript
const PASSWORD_POLICY = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecial: true,
  preventCommon: true,           // Check against common password list
  preventReuse: 5,               // Can't reuse last 5 passwords
  maxAge: 90,                    // Days until password must be changed (0 = never)
};
```

### Password Hashing

```typescript
import * as argon2 from 'argon2';

const ARGON2_CONFIG = {
  type: argon2.argon2id,
  memoryCost: 65536,             // 64 MB
  timeCost: 3,
  parallelism: 4,
};

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_CONFIG);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, password);
}
```

### Password Change

```http
POST /auth/password
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "currentPassword": "oldPassword123!",
  "newPassword": "newSecurePassword456!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully",
  "sessionsRevoked": 2
}
```

**Actions:**
1. Verify current password
2. Validate new password against policy
3. Hash and store new password
4. Revoke all other sessions (keep current)
5. Log password change event

---

## Security Headers

All authentication responses include:

```http
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Cache-Control: no-store
Pragma: no-cache
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `TOKEN_EXPIRED` | 401 | Access or refresh token expired |
| `TOKEN_INVALID` | 401 | Token malformed or signature invalid |
| `TOKEN_REVOKED` | 401 | Token has been revoked |
| `SESSION_EXPIRED` | 401 | Session no longer valid |
| `ACCOUNT_LOCKED` | 403 | Too many failed login attempts |
| `ACCOUNT_DISABLED` | 403 | Account has been deactivated |
| `PERMISSION_DENIED` | 403 | Insufficient permissions |
| `API_KEY_INVALID` | 401 | Invalid or revoked API key |
| `SIGNATURE_INVALID` | 401 | Webhook signature verification failed |
| `PASSWORD_POLICY` | 400 | Password doesn't meet requirements |

---

## Configuration Summary

```yaml
auth:
  jwt:
    algorithm: HS256
    accessTokenTTL: 900           # 15 minutes
    refreshTokenTTL:
      dashboard: 604800           # 7 days
      mobile: 2592000             # 30 days
    refreshGracePeriod: 300       # 5 minutes

  sessions:
    maxPerUser: 5
    maxPerDeviceType:
      dashboard: 2
      mobile: 3
    cleanupInterval: 3600         # Hourly cleanup of expired sessions

  password:
    minLength: 12
    requireUppercase: true
    requireLowercase: true
    requireNumbers: true
    requireSpecial: true
    preventCommon: true
    preventReuse: 5
    maxAge: 90

  rateLimit:
    login:
      maxAttempts: 5
      windowMinutes: 15
      lockoutMinutes: 15
    refresh:
      maxAttempts: 10
      windowMinutes: 5

  apiKeys:
    maxPerProperty: 10
    rotationReminder: 90          # Days before suggesting rotation
```

---

## Related

- [Gateway API](gateway-api.md) - API endpoints
- [WebSocket Protocol](gateway-api.md#websocket-api) - WebSocket authentication
- [ID Formats](../conventions/id-formats.md) - Token and session ID formats
