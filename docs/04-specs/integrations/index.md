# Integration Specifications

Technical specifications for connecting Jack to external systems.

---

## Overview

Jack integrates with two categories of external systems:

1. **Communication Channels** - How guests reach Jack
2. **Hotel Systems** - Where Jack gets and writes hospitality data

---

## Communication Channels

| Channel | Status | Documentation |
|---------|--------|---------------|
| WhatsApp Business | Supported | [WhatsApp Channel](whatsapp-channel.md) |
| SMS (Twilio) | Supported | [SMS Channel](sms-channel.md) |
| Email | Supported | Planned |
| Web Chat | Supported | Planned |
| Voice | Roadmap | — |

### Channel Selection Guide

| Use Case | Recommended Channel |
|----------|---------------------|
| International guests | WhatsApp |
| US/Canada guests | SMS |
| Formal communication | Email |
| Website visitors | Web Chat |
| Immediate assistance | Voice (future) |

---

## Hotel Systems

### Property Management Systems (PMS)

| PMS | Status | Documentation |
|-----|--------|---------------|
| Oracle Opera Cloud | Supported | [PMS Integration](pms-integration.md) |
| Mews | Supported | [PMS Integration](pms-integration.md) |
| Cloudbeds | Supported | [PMS Integration](pms-integration.md) |
| Protel | Roadmap | — |
| Clock PMS | Roadmap | — |

### Operational Systems

| System Type | Vendors | Status |
|-------------|---------|--------|
| Housekeeping | Optii, Flexkeeping | Roadmap |
| Maintenance | Custom integration | Supported |
| POS | Micros, Toast | Roadmap |
| Door Locks | Assa Abloy, Salto | Roadmap |

---

## Integration Patterns

### Real-Time Sync

Used for time-sensitive data:
- Room status changes
- Check-in/check-out events
- Task completions

Implementation: Webhooks from source system

### Scheduled Sync

Used for bulk data:
- Arrivals/departures list
- Guest profile updates
- Rate information

Implementation: Polling on schedule (5-15 min intervals)

### On-Demand

Used for transactional operations:
- Guest lookup
- Charge posting
- Reservation updates

Implementation: Direct API calls

---

## Authentication Methods

| Method | Used By | Notes |
|--------|---------|-------|
| OAuth 2.0 | Opera Cloud, Mews | Token refresh required |
| API Key | Twilio, Cloudbeds | Simple, key rotation recommended |
| Certificate | Some enterprise PMS | Mutual TLS |
| Basic Auth | Legacy systems | Avoid if possible |

---

## Data Mapping

All integrations map to Jack's internal data model:

```
External System          Jack Internal
───────────────          ─────────────
PMS Guest Profile   →    Guest
PMS Reservation     →    Reservation
PMS Room Status     →    RoomStatus
Housekeeping Task   →    Task
Channel Message     →    Message
```

See [Data Model](../../03-architecture/data-model.md) for internal schema.

---

## Integration Checklist

When implementing a new integration:

- [ ] Authentication mechanism documented
- [ ] API rate limits understood
- [ ] Data mapping defined
- [ ] Error handling implemented
- [ ] Retry logic in place
- [ ] Monitoring/alerting configured
- [ ] Sandbox/test environment available
- [ ] Production credentials secured
- [ ] Documentation complete

---

## Related

- [Integration Layer Architecture](../../03-architecture/c4-components/integration-layer.md)
- [ADR-004: PMS Integration Pattern](../../03-architecture/decisions/004-pms-integration-pattern.md)
