# Data Retention Policy Specification

This document defines data retention policies for Jack The Butler to ensure compliance, privacy, and efficient storage management.

---

## Overview

Jack stores various types of data with different retention requirements based on:

- Legal/compliance requirements (GDPR, CCPA, PCI-DSS)
- Business needs (analytics, audit trails)
- Privacy expectations (guest data)
- Storage efficiency

---

## Data Categories

### Category 1: Transient Data

Data that exists only for immediate processing.

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Session tokens | Duration of session | Cleared on logout |
| Temp files | 24 hours | Auto-cleaned |
| Cache entries | 1 hour (configurable) | Auto-evicted |
| Rate limit counters | 1 hour | Rolling window |

### Category 2: Operational Data

Data needed for current operations.

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Active conversations | Until closed | Plus reopen window |
| Pending tasks | Until completed | Plus 30 days |
| Staff sessions | 30 days | Security audit |
| Webhook delivery queue | 7 days | Retry window |

### Category 3: Business Data

Data for business operations and analytics.

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Closed conversations | 1 year | Then archive |
| Message content | 1 year | Then redact |
| Task history | 2 years | Analytics |
| Reservation data | 2 years | Guest history |
| Analytics aggregates | 3 years | Business intelligence |

### Category 4: Compliance Data

Data required for legal/regulatory compliance.

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Audit logs | 7 years | Regulatory requirement |
| Staff activity logs | 3 years | HR/compliance |
| Consent records | 7 years | GDPR requirement |
| Payment records | 7 years | Financial regulations |
| Security incident logs | 7 years | Compliance |

### Category 5: Guest Personal Data

Subject to privacy regulations.

| Data Type | Retention | Notes |
|-----------|-----------|-------|
| Guest profile | Until deletion request | Or 3 years inactive |
| Contact information | Until deletion request | Or 3 years inactive |
| Preferences | Until deletion request | Or 3 years inactive |
| Message content | 1 year | Then redact PII |
| Uploaded files | 1 year | Then delete |

---

## Retention Schedule

### Automated Retention Jobs

```typescript
interface RetentionJob {
  name: string;
  schedule: string;              // Cron expression
  dataType: string;
  retentionDays: number;
  action: 'delete' | 'archive' | 'redact';
}

const RETENTION_JOBS: RetentionJob[] = [
  // Daily cleanup
  {
    name: 'clean_temp_files',
    schedule: '0 3 * * *',       // 3 AM daily
    dataType: 'temp_files',
    retentionDays: 1,
    action: 'delete',
  },
  {
    name: 'clean_expired_sessions',
    schedule: '0 4 * * *',       // 4 AM daily
    dataType: 'sessions',
    retentionDays: 30,
    action: 'delete',
  },

  // Weekly cleanup
  {
    name: 'archive_old_conversations',
    schedule: '0 2 * * 0',       // 2 AM Sunday
    dataType: 'conversations',
    retentionDays: 365,
    action: 'archive',
  },
  {
    name: 'delete_old_uploads',
    schedule: '0 2 * * 0',       // 2 AM Sunday
    dataType: 'uploads',
    retentionDays: 365,
    action: 'delete',
  },

  // Monthly cleanup
  {
    name: 'archive_old_tasks',
    schedule: '0 1 1 * *',       // 1 AM 1st of month
    dataType: 'tasks',
    retentionDays: 730,          // 2 years
    action: 'archive',
  },
  {
    name: 'clean_inactive_guests',
    schedule: '0 1 1 * *',       // 1 AM 1st of month
    dataType: 'guests',
    retentionDays: 1095,         // 3 years
    action: 'anonymize',
  },
];
```

### Implementation

```typescript
class RetentionService {
  async runRetentionJob(job: RetentionJob): Promise<RetentionResult> {
    const cutoffDate = subDays(new Date(), job.retentionDays);

    logger.info('Running retention job', {
      job: job.name,
      cutoffDate,
      action: job.action,
    });

    let processed = 0;
    let errors = 0;

    try {
      switch (job.action) {
        case 'delete':
          processed = await this.deleteOldRecords(job.dataType, cutoffDate);
          break;

        case 'archive':
          processed = await this.archiveOldRecords(job.dataType, cutoffDate);
          break;

        case 'redact':
          processed = await this.redactOldRecords(job.dataType, cutoffDate);
          break;
      }
    } catch (error) {
      logger.error('Retention job failed', { job: job.name, error });
      errors++;
    }

    // Log retention activity
    await this.logRetentionActivity({
      jobName: job.name,
      dataType: job.dataType,
      cutoffDate,
      action: job.action,
      recordsProcessed: processed,
      errors,
      completedAt: new Date(),
    });

    return { processed, errors };
  }

  private async deleteOldRecords(dataType: string, cutoffDate: Date): Promise<number> {
    switch (dataType) {
      case 'temp_files':
        return this.deleteTempFiles(cutoffDate);

      case 'sessions':
        return this.deleteExpiredSessions(cutoffDate);

      case 'uploads':
        return this.deleteOldUploads(cutoffDate);

      default:
        throw new Error(`Unknown data type: ${dataType}`);
    }
  }

  private async archiveOldRecords(dataType: string, cutoffDate: Date): Promise<number> {
    switch (dataType) {
      case 'conversations':
        return this.archiveConversations(cutoffDate);

      case 'tasks':
        return this.archiveTasks(cutoffDate);

      default:
        throw new Error(`Unknown data type: ${dataType}`);
    }
  }
}
```

---

## Archive Strategy

### Archive Format

```typescript
interface ArchiveRecord {
  id: string;
  originalTable: string;
  archivedAt: Date;
  data: Record<string, unknown>;   // Compressed JSON
  checksum: string;
}

// Archive table
CREATE TABLE archives (
  id TEXT PRIMARY KEY,
  original_table TEXT NOT NULL,
  original_id TEXT NOT NULL,
  archived_at TEXT DEFAULT (datetime('now')),
  data BLOB NOT NULL,              -- Compressed JSON
  checksum TEXT NOT NULL,

  UNIQUE(original_table, original_id)
);

CREATE INDEX idx_archives_table ON archives(original_table);
CREATE INDEX idx_archives_date ON archives(archived_at);
```

### Archive Implementation

```typescript
async function archiveConversations(cutoffDate: Date): Promise<number> {
  // Find conversations to archive
  const toArchive = await db.prepare(`
    SELECT * FROM conversations
    WHERE status = 'closed'
    AND closed_at < ?
    AND id NOT IN (SELECT original_id FROM archives WHERE original_table = 'conversations')
  `).all(cutoffDate.toISOString());

  let archived = 0;

  for (const conv of toArchive) {
    await db.transaction(async (tx) => {
      // Get related data
      const messages = await tx.messages.findByConversation(conv.id);
      const uploads = await tx.uploads.findByConversation(conv.id);

      // Create archive record
      const archiveData = {
        conversation: conv,
        messages,
        uploads: uploads.map(u => ({
          ...u,
          // Don't store actual file content, just metadata
          storagePath: undefined,
        })),
      };

      const compressed = await compress(JSON.stringify(archiveData));
      const checksum = crypto.createHash('sha256').update(compressed).digest('hex');

      await tx.archives.create({
        id: generateId('arch'),
        originalTable: 'conversations',
        originalId: conv.id,
        data: compressed,
        checksum,
      });

      // Delete original records
      await tx.messages.deleteByConversation(conv.id);
      await tx.conversations.delete(conv.id);

      // Delete uploaded files
      for (const upload of uploads) {
        await deleteUploadFiles(upload);
        await tx.uploads.delete(upload.id);
      }

      archived++;
    });
  }

  return archived;
}
```

### Archive Retrieval

```typescript
async function retrieveArchivedConversation(
  conversationId: string
): Promise<ArchivedConversation | null> {
  const archive = await db.prepare(`
    SELECT * FROM archives
    WHERE original_table = 'conversations' AND original_id = ?
  `).get(conversationId);

  if (!archive) {
    return null;
  }

  // Verify integrity
  const checksum = crypto.createHash('sha256').update(archive.data).digest('hex');
  if (checksum !== archive.checksum) {
    logger.error('Archive integrity check failed', { conversationId });
    throw new IntegrityError('Archive data corrupted');
  }

  // Decompress and parse
  const decompressed = await decompress(archive.data);
  return JSON.parse(decompressed);
}
```

---

## PII Redaction

### Redaction Rules

```typescript
interface RedactionRule {
  field: string;
  pattern?: RegExp;
  replacement: string | ((match: string) => string);
}

const REDACTION_RULES: RedactionRule[] = [
  // Names
  {
    field: 'guest_name',
    replacement: '[REDACTED]',
  },

  // Email addresses
  {
    field: 'content',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL]',
  },

  // Phone numbers
  {
    field: 'content',
    pattern: /\+?[\d\s\-().]{10,}/g,
    replacement: '[PHONE]',
  },

  // Credit card numbers
  {
    field: 'content',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: '[CARD]',
  },

  // Room numbers (keep for context but redact last digit)
  {
    field: 'content',
    pattern: /\b(room|rm)\s*#?\s*(\d+)/gi,
    replacement: (match) => match.slice(0, -1) + 'X',
  },

  // Addresses
  {
    field: 'address',
    replacement: '[ADDRESS]',
  },
];

async function redactPII(record: Record<string, unknown>): Promise<Record<string, unknown>> {
  const redacted = { ...record };

  for (const rule of REDACTION_RULES) {
    if (rule.field in redacted && redacted[rule.field]) {
      if (rule.pattern) {
        redacted[rule.field] = String(redacted[rule.field]).replace(
          rule.pattern,
          rule.replacement as string
        );
      } else {
        redacted[rule.field] = rule.replacement;
      }
    }
  }

  return redacted;
}
```

### Redaction Implementation

```typescript
async function redactOldMessages(cutoffDate: Date): Promise<number> {
  const messages = await db.prepare(`
    SELECT m.* FROM messages m
    JOIN conversations c ON m.conversation_id = c.id
    WHERE c.closed_at < ?
    AND m.redacted_at IS NULL
  `).all(cutoffDate.toISOString());

  let redacted = 0;

  for (const message of messages) {
    const redactedContent = await redactPII({ content: message.content });

    await db.messages.update(message.id, {
      content: redactedContent.content,
      redactedAt: new Date(),
      originalChecksum: crypto.createHash('sha256')
        .update(message.content)
        .digest('hex'),
    });

    redacted++;
  }

  return redacted;
}
```

---

## Guest Data Rights (GDPR/CCPA)

### Right to Access

```typescript
// GET /api/v1/guests/:guestId/data-export
async function exportGuestData(guestId: string): Promise<GuestDataExport> {
  const guest = await db.guests.findById(guestId);
  if (!guest) {
    throw new NotFoundError('Guest not found');
  }

  // Collect all guest data
  const data: GuestDataExport = {
    exportedAt: new Date(),
    guest: {
      id: guest.id,
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
      createdAt: guest.createdAt,
    },
    conversations: await db.conversations.findByGuest(guestId),
    messages: await db.messages.findByGuest(guestId),
    preferences: guest.preferences,
    reservations: await db.reservations.findByGuest(guestId),
    consents: await db.consents.findByGuest(guestId),
  };

  // Include archived data
  const archived = await db.archives.findByGuest(guestId);
  if (archived.length > 0) {
    data.archivedData = archived.map(a => ({
      type: a.originalTable,
      archivedAt: a.archivedAt,
      // Include summary, not full content
    }));
  }

  // Log data export
  await logDataAccess({
    action: 'data_export',
    guestId,
    exportedAt: new Date(),
    dataTypes: Object.keys(data),
  });

  return data;
}
```

### Right to Erasure

```typescript
// DELETE /api/v1/guests/:guestId
async function deleteGuestData(
  guestId: string,
  reason: string
): Promise<DeletionResult> {
  const guest = await db.guests.findById(guestId);
  if (!guest) {
    throw new NotFoundError('Guest not found');
  }

  // Check if deletion is possible
  const activeConversations = await db.conversations.countActive(guestId);
  if (activeConversations > 0) {
    throw new ConflictError('Cannot delete guest with active conversations');
  }

  const pendingTasks = await db.tasks.countPendingForGuest(guestId);
  if (pendingTasks > 0) {
    throw new ConflictError('Cannot delete guest with pending tasks');
  }

  // Perform deletion
  await db.transaction(async (tx) => {
    // Delete uploads
    const uploads = await tx.uploads.findByGuest(guestId);
    for (const upload of uploads) {
      await deleteUploadFiles(upload);
      await tx.uploads.delete(upload.id);
    }

    // Delete messages
    await tx.messages.deleteByGuest(guestId);

    // Delete conversations
    await tx.conversations.deleteByGuest(guestId);

    // Delete preferences
    await tx.guestPreferences.deleteByGuest(guestId);

    // Anonymize reservations (keep for business records)
    await tx.prepare(`
      UPDATE reservations
      SET guest_name = '[DELETED]',
          guest_email = NULL,
          guest_phone = NULL
      WHERE guest_id = ?
    `).run(guestId);

    // Delete guest record
    await tx.guests.delete(guestId);

    // Delete from archives
    await tx.archives.deleteByGuest(guestId);
  });

  // Log deletion
  await logDataAccess({
    action: 'data_deletion',
    guestId,
    deletedAt: new Date(),
    reason,
    requestedBy: 'guest',
  });

  return {
    success: true,
    deletedAt: new Date(),
  };
}
```

### Consent Management

```typescript
interface ConsentRecord {
  id: string;
  guestId: string;
  type: ConsentType;
  granted: boolean;
  grantedAt?: Date;
  revokedAt?: Date;
  source: string;               // 'webchat', 'staff', 'api'
  ipAddress?: string;
  userAgent?: string;
}

type ConsentType =
  | 'marketing_email'
  | 'marketing_sms'
  | 'data_processing'
  | 'analytics'
  | 'personalization'
  | 'third_party_sharing';

async function recordConsent(
  guestId: string,
  consent: ConsentUpdate
): Promise<void> {
  await db.consents.upsert({
    id: generateId('cons'),
    guestId,
    type: consent.type,
    granted: consent.granted,
    grantedAt: consent.granted ? new Date() : undefined,
    revokedAt: consent.granted ? undefined : new Date(),
    source: consent.source,
    ipAddress: consent.ipAddress,
    userAgent: consent.userAgent,
  });

  // Log consent change
  await logConsentChange({
    guestId,
    type: consent.type,
    newValue: consent.granted,
    changedAt: new Date(),
    source: consent.source,
  });
}
```

---

## Backup Integration

### Backup Considerations

```typescript
interface BackupConfig {
  // Include in regular backups
  includeTables: string[];

  // Exclude from backups (temp data)
  excludeTables: string[];

  // Encrypt backup files
  encryption: {
    enabled: boolean;
    algorithm: string;
    keyRotationDays: number;
  };

  // Backup retention
  retention: {
    daily: number;              // Days to keep daily backups
    weekly: number;             // Weeks to keep weekly backups
    monthly: number;            // Months to keep monthly backups
  };
}

const BACKUP_CONFIG: BackupConfig = {
  includeTables: [
    'guests',
    'conversations',
    'messages',
    'tasks',
    'staff',
    'reservations',
    'knowledge_base',
    'audit_log',
    'consents',
    'archives',
  ],

  excludeTables: [
    'sessions',
    'rate_limits',
    'cache',
    'job_queue',
  ],

  encryption: {
    enabled: true,
    algorithm: 'aes-256-gcm',
    keyRotationDays: 90,
  },

  retention: {
    daily: 7,                   // 7 daily backups
    weekly: 4,                  // 4 weekly backups
    monthly: 12,                // 12 monthly backups
  },
};
```

---

## Audit Trail

### Retention Activity Logging

```typescript
CREATE TABLE retention_log (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  data_type TEXT NOT NULL,
  action TEXT NOT NULL,         -- 'delete', 'archive', 'redact'
  cutoff_date TEXT NOT NULL,
  records_processed INTEGER NOT NULL,
  records_failed INTEGER DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  error_message TEXT
);

CREATE INDEX idx_retention_log_date ON retention_log(completed_at);
CREATE INDEX idx_retention_log_type ON retention_log(data_type);
```

### Data Access Logging

```typescript
CREATE TABLE data_access_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,         -- 'export', 'deletion', 'access'
  guest_id TEXT,
  staff_id TEXT,
  requested_by TEXT NOT NULL,   -- 'guest', 'staff', 'system'
  data_types JSON,              -- What data was accessed
  reason TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_data_access_guest ON data_access_log(guest_id);
CREATE INDEX idx_data_access_date ON data_access_log(created_at);
```

---

## Configuration

```yaml
dataRetention:
  # Enable retention jobs
  enabled: true

  # Job schedule timezone
  timezone: "UTC"

  # Retention periods (days unless noted)
  periods:
    # Transient
    tempFiles: 1
    sessions: 30
    rateLimit: 0.042             # 1 hour

    # Operational
    conversations: 365
    messages: 365
    uploads: 365
    tasks: 730                   # 2 years

    # Business
    analytics: 1095              # 3 years
    reservations: 730            # 2 years

    # Compliance
    auditLog: 2555               # 7 years
    consents: 2555               # 7 years
    paymentRecords: 2555         # 7 years

    # Guest data (inactive)
    guestInactivity: 1095        # 3 years

  # Archive settings
  archive:
    enabled: true
    compression: "gzip"
    location: "./data/archives"

  # Redaction settings
  redaction:
    enabled: true
    afterDays: 365               # Redact PII after 1 year

  # GDPR/CCPA settings
  privacy:
    exportEnabled: true
    deletionEnabled: true
    deletionGracePeriodDays: 30  # Delay before permanent deletion

  # Notifications
  notifications:
    notifyOnDeletion: true
    notifyOnExport: true
    adminEmail: "admin@example.com"
```

---

## Related

- [Logging](logging.md) - Audit log format
- [Authentication](../04-specs/api/authentication.md) - Session management
- [File Uploads](../04-specs/features/file-uploads.md) - Upload retention
- [Deployment](deployment.md) - Backup procedures
