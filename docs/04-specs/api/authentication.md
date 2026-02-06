# Authentication

JWT-based authentication for the staff dashboard.

---

## Overview

- **Method:** Bearer token (JWT)
- **Algorithm:** HS256
- **Access token:** 15-minute expiry
- **Refresh token:** 24 hours (30 days with "remember me")

---

## Login Flow

1. Staff member logs in with email/password
2. Server returns access token + refresh token
3. Client stores tokens (memory for access, storage for refresh)
4. Client includes access token in `Authorization` header
5. When access token expires, use refresh token to get new pair

---

## Endpoints

### POST /auth/login

Authenticate with credentials.

**Request:**
```json
{
  "email": "staff@hotel.com",
  "password": "password",
  "rememberMe": false
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiresIn": 900
}
```

| Field | Description |
|-------|-------------|
| `accessToken` | JWT for API requests (15 min) |
| `refreshToken` | JWT for getting new tokens |
| `expiresIn` | Access token TTL in seconds |

### POST /auth/refresh

Get new access token using refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:** Same as login.

### GET /auth/me

Get current user info. Requires authentication.

**Response:**
```json
{
  "user": {
    "id": "staff-123",
    "email": "staff@hotel.com",
    "name": "John Smith",
    "role": "manager",
    "department": "front-desk"
  }
}
```

### POST /auth/logout

End session. Requires authentication.

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

---

## Using Tokens

Include access token in `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

For WebSocket connections, pass token as query parameter:

```
ws://localhost:3000/ws?token=eyJhbGciOiJIUzI1NiIs...
```

---

## JWT Payload

**Access token:**
```json
{
  "sub": "staff-123",
  "role": "manager",
  "type": "access",
  "iat": 1699999999,
  "exp": 1700000899
}
```

**Refresh token:**
```json
{
  "sub": "staff-123",
  "type": "refresh",
  "iat": 1699999999,
  "exp": 1700086399
}
```

---

## Roles

| Role | Description |
|------|-------------|
| `admin` | Full system access |
| `manager` | Staff management, approvals |
| `staff` | Handle conversations, tasks |

Role-based route protection:

```typescript
// Require specific role
app.use('/admin/*', requireAuth, requireRole('admin'));

// Require any of multiple roles
app.use('/settings/*', requireAuth, requireRole('admin', 'manager'));
```

---

## Errors

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` (401) | Missing/invalid token, invalid credentials |
| `FORBIDDEN` (403) | Valid token but insufficient role |

---

## Security Notes

- Access tokens are short-lived (15 min) to limit exposure
- Refresh tokens are longer-lived but can be revoked
- Failed login attempts are logged for audit
- Tokens use HMAC-SHA256 with `JWT_SECRET` from config

---

## Related

- [REST API](rest-api.md) — Protected endpoints
- [WebSocket](websocket.md) — Token in query string
