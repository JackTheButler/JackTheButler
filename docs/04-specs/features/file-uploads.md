# File Upload Handling Specification

This document defines how Jack The Butler handles file uploads from guests and staff.

---

## Overview

Guests may send images, documents, and voice messages through various channels. Jack stores these files locally and processes them for:

- Storage and retrieval
- Virus scanning
- Image analysis (if enabled)
- Voice transcription (if enabled)

---

## Storage Architecture

### Local Filesystem

Files are stored on the local filesystem (self-hosted model):

```
data/
├── uploads/
│   ├── messages/           # Files from guest messages
│   │   ├── 2024/
│   │   │   ├── 01/
│   │   │   │   ├── {messageId}/
│   │   │   │   │   ├── original/
│   │   │   │   │   │   └── image.jpg
│   │   │   │   │   └── processed/
│   │   │   │   │       ├── thumbnail.jpg
│   │   │   │   │       └── medium.jpg
│   ├── knowledge/          # Knowledge base documents
│   │   └── {propertyId}/
│   ├── exports/            # Data exports
│   └── temp/               # Temporary processing
```

### Database Reference

```sql
CREATE TABLE uploads (
  id TEXT PRIMARY KEY,              -- upload_xxx
  message_id TEXT REFERENCES messages(id),
  type TEXT NOT NULL,               -- 'image', 'document', 'audio', 'video'
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,       -- Relative path from data/uploads/
  checksum TEXT NOT NULL,           -- SHA-256 hash
  scan_status TEXT DEFAULT 'pending', -- 'pending', 'clean', 'infected', 'error'
  scan_result JSON,
  metadata JSON,                    -- Dimensions, duration, etc.
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT                   -- For temporary files
);

CREATE INDEX idx_uploads_message ON uploads(message_id);
CREATE INDEX idx_uploads_type ON uploads(type);
CREATE INDEX idx_uploads_scan_status ON uploads(scan_status);
```

---

## File Type Restrictions

### Allowed Types

```typescript
const ALLOWED_FILE_TYPES: Record<string, FileTypeConfig> = {
  // Images
  'image/jpeg': { maxSize: 10 * MB, extensions: ['.jpg', '.jpeg'] },
  'image/png': { maxSize: 10 * MB, extensions: ['.png'] },
  'image/gif': { maxSize: 5 * MB, extensions: ['.gif'] },
  'image/webp': { maxSize: 10 * MB, extensions: ['.webp'] },
  'image/heic': { maxSize: 10 * MB, extensions: ['.heic', '.heif'] },

  // Documents
  'application/pdf': { maxSize: 25 * MB, extensions: ['.pdf'] },
  'application/msword': { maxSize: 10 * MB, extensions: ['.doc'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    maxSize: 10 * MB,
    extensions: ['.docx'],
  },

  // Audio (voice messages)
  'audio/ogg': { maxSize: 15 * MB, extensions: ['.ogg', '.opus'] },
  'audio/mpeg': { maxSize: 15 * MB, extensions: ['.mp3'] },
  'audio/mp4': { maxSize: 15 * MB, extensions: ['.m4a'] },
  'audio/wav': { maxSize: 25 * MB, extensions: ['.wav'] },

  // Video (short clips)
  'video/mp4': { maxSize: 50 * MB, extensions: ['.mp4'] },
  'video/quicktime': { maxSize: 50 * MB, extensions: ['.mov'] },
};

interface FileTypeConfig {
  maxSize: number;
  extensions: string[];
}

const MB = 1024 * 1024;
```

### Blocked Types

Never accept these file types:

```typescript
const BLOCKED_EXTENSIONS = [
  '.exe', '.dll', '.bat', '.cmd', '.sh', '.ps1',  // Executables
  '.js', '.vbs', '.wsf', '.hta',                   // Scripts
  '.msi', '.scr', '.com', '.pif',                  // Windows executables
  '.jar', '.class',                                 // Java
  '.php', '.asp', '.aspx', '.jsp',                 // Server scripts
];

const BLOCKED_MIME_TYPES = [
  'application/x-msdownload',
  'application/x-executable',
  'application/x-msdos-program',
  'application/javascript',
  'text/javascript',
];
```

---

## Upload Flow

### Step 1: Validation

```typescript
interface UploadValidation {
  isValid: boolean;
  error?: string;
  sanitizedFilename?: string;
  mimeType?: string;
}

async function validateUpload(
  file: File,
  buffer: Buffer
): Promise<UploadValidation> {
  // Check file size first (fast)
  const maxSize = getMaxSizeForType(file.type);
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: `File too large. Maximum size: ${formatBytes(maxSize)}`,
    };
  }

  // Verify MIME type matches actual content (magic bytes)
  const detectedMime = await detectMimeType(buffer);
  if (detectedMime !== file.type) {
    return {
      isValid: false,
      error: 'File type does not match content',
    };
  }

  // Check against allowed types
  if (!ALLOWED_FILE_TYPES[file.type]) {
    return {
      isValid: false,
      error: `File type not allowed: ${file.type}`,
    };
  }

  // Check extension
  const ext = path.extname(file.name).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return {
      isValid: false,
      error: 'File extension not allowed',
    };
  }

  // Sanitize filename
  const sanitizedFilename = sanitizeFilename(file.name);

  return {
    isValid: true,
    sanitizedFilename,
    mimeType: detectedMime,
  };
}

function sanitizeFilename(filename: string): string {
  // Remove path components
  const name = path.basename(filename);

  // Replace dangerous characters
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.{2,}/g, '.')
    .substring(0, 255);
}
```

### Step 2: Virus Scanning

```typescript
interface ScanResult {
  status: 'clean' | 'infected' | 'error';
  engine: string;
  signature?: string;
  error?: string;
}

async function scanFile(filePath: string): Promise<ScanResult> {
  // Use ClamAV for scanning
  const clamav = new ClamAV({
    socket: config.clamav.socket || '/var/run/clamav/clamd.ctl',
  });

  try {
    const result = await clamav.scanFile(filePath);

    if (result.isInfected) {
      logger.warn('Infected file detected', {
        filePath,
        signature: result.viruses[0],
      });

      // Delete infected file immediately
      await fs.unlink(filePath);

      return {
        status: 'infected',
        engine: 'clamav',
        signature: result.viruses[0],
      };
    }

    return {
      status: 'clean',
      engine: 'clamav',
    };
  } catch (error) {
    logger.error('Virus scan failed', { error, filePath });

    return {
      status: 'error',
      engine: 'clamav',
      error: error.message,
    };
  }
}
```

### Step 3: Storage

```typescript
async function storeUpload(
  buffer: Buffer,
  metadata: UploadMetadata
): Promise<StoredUpload> {
  const uploadId = generateId('upload');
  const date = new Date();

  // Build storage path
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const relativePath = `messages/${year}/${month}/${metadata.messageId}`;
  const absolutePath = path.join(config.uploadsDir, relativePath);

  // Ensure directory exists
  await fs.mkdir(path.join(absolutePath, 'original'), { recursive: true });

  // Calculate checksum
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');

  // Check for duplicates
  const existing = await db.uploads.findByChecksum(checksum);
  if (existing) {
    logger.info('Duplicate file detected', { checksum, existing: existing.id });
    return existing;
  }

  // Write file
  const originalPath = path.join(absolutePath, 'original', metadata.filename);
  await fs.writeFile(originalPath, buffer);

  // Create database record
  const upload = await db.uploads.create({
    id: uploadId,
    messageId: metadata.messageId,
    type: getFileType(metadata.mimeType),
    originalFilename: metadata.filename,
    mimeType: metadata.mimeType,
    sizeBytes: buffer.length,
    storagePath: path.join(relativePath, 'original', metadata.filename),
    checksum,
    scanStatus: 'pending',
    metadata: metadata.extra,
  });

  // Queue virus scan
  await jobQueue.add('scan_upload', { uploadId });

  // Queue processing (thumbnails, etc.)
  await jobQueue.add('process_upload', { uploadId });

  return upload;
}
```

### Step 4: Processing

```typescript
async function processUpload(uploadId: string): Promise<void> {
  const upload = await db.uploads.findById(uploadId);
  if (!upload) return;

  const absolutePath = path.join(config.uploadsDir, upload.storagePath);
  const processedDir = path.dirname(absolutePath).replace('/original', '/processed');
  await fs.mkdir(processedDir, { recursive: true });

  switch (upload.type) {
    case 'image':
      await processImage(absolutePath, processedDir, upload);
      break;

    case 'audio':
      await processAudio(absolutePath, processedDir, upload);
      break;

    case 'video':
      await processVideo(absolutePath, processedDir, upload);
      break;

    case 'document':
      // No processing needed for documents
      break;
  }
}

async function processImage(
  originalPath: string,
  processedDir: string,
  upload: Upload
): Promise<void> {
  const sharp = (await import('sharp')).default;

  // Get image metadata
  const metadata = await sharp(originalPath).metadata();

  // Generate thumbnail (150x150)
  await sharp(originalPath)
    .resize(150, 150, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toFile(path.join(processedDir, 'thumbnail.jpg'));

  // Generate medium size (800px max)
  await sharp(originalPath)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toFile(path.join(processedDir, 'medium.jpg'));

  // Update metadata
  await db.uploads.update(upload.id, {
    metadata: {
      ...upload.metadata,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      hasAlpha: metadata.hasAlpha,
    },
  });
}

async function processAudio(
  originalPath: string,
  processedDir: string,
  upload: Upload
): Promise<void> {
  // Get audio duration using ffprobe
  const duration = await getAudioDuration(originalPath);

  // Update metadata
  await db.uploads.update(upload.id, {
    metadata: {
      ...upload.metadata,
      durationSeconds: duration,
    },
  });

  // Queue transcription if enabled
  if (await features.isEnabled('voiceTranscription')) {
    await jobQueue.add('transcribe_audio', { uploadId: upload.id });
  }
}
```

---

## File Retrieval

### Serve Files

```typescript
// GET /api/v1/uploads/:uploadId
async function serveUpload(ctx: Context): Promise<void> {
  const { uploadId } = ctx.req.param();
  const variant = ctx.req.query('variant') || 'original';

  const upload = await db.uploads.findById(uploadId);
  if (!upload) {
    ctx.status = 404;
    return;
  }

  // Check access permissions
  if (!await canAccessUpload(ctx.state.user, upload)) {
    ctx.status = 403;
    return;
  }

  // Check scan status
  if (upload.scanStatus === 'infected') {
    ctx.status = 410; // Gone
    ctx.body = { error: 'File was removed due to security concerns' };
    return;
  }

  if (upload.scanStatus === 'pending') {
    ctx.status = 202; // Accepted but not ready
    ctx.body = { error: 'File is being processed', retryAfter: 5 };
    return;
  }

  // Get file path for variant
  const filePath = getVariantPath(upload, variant);
  const absolutePath = path.join(config.uploadsDir, filePath);

  if (!await fs.access(absolutePath).then(() => true).catch(() => false)) {
    ctx.status = 404;
    return;
  }

  // Set headers
  ctx.header('Content-Type', upload.mimeType);
  ctx.header('Content-Disposition', `inline; filename="${upload.originalFilename}"`);
  ctx.header('Cache-Control', 'private, max-age=86400');
  ctx.header('X-Content-Type-Options', 'nosniff');

  // Stream file
  ctx.body = fs.createReadStream(absolutePath);
}

function getVariantPath(upload: Upload, variant: string): string {
  if (variant === 'original') {
    return upload.storagePath;
  }

  const dir = path.dirname(upload.storagePath).replace('/original', '/processed');
  const variantFile = `${variant}.jpg`; // Assuming processed variants are JPEG
  return path.join(dir, variantFile);
}
```

### Signed URLs (Optional)

For additional security, generate time-limited signed URLs:

```typescript
function generateSignedUrl(uploadId: string, expiresIn: number = 3600): string {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const signature = crypto
    .createHmac('sha256', config.uploadSecret)
    .update(`${uploadId}:${expires}`)
    .digest('hex');

  return `/api/v1/uploads/${uploadId}?expires=${expires}&signature=${signature}`;
}

function verifySignedUrl(uploadId: string, expires: string, signature: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (parseInt(expires) < now) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', config.uploadSecret)
    .update(`${uploadId}:${expires}`)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

---

## Retention Policy

### Automatic Cleanup

```typescript
interface RetentionPolicy {
  messageUploads: number;      // Days to keep message attachments
  tempFiles: number;           // Hours to keep temp files
  exports: number;             // Days to keep data exports
  infectedFiles: number;       // Immediately delete (0)
}

const DEFAULT_RETENTION: RetentionPolicy = {
  messageUploads: 365,         // 1 year
  tempFiles: 24,               // 24 hours
  exports: 7,                  // 1 week
  infectedFiles: 0,            // Immediate
};

// Scheduled cleanup job
async function cleanupExpiredUploads(): Promise<void> {
  const now = new Date();

  // Find expired uploads
  const expired = await db.prepare(`
    SELECT * FROM uploads
    WHERE expires_at IS NOT NULL AND expires_at < ?
  `).all(now.toISOString());

  for (const upload of expired) {
    await deleteUpload(upload.id);
  }

  // Clean temp directory
  await cleanTempDirectory();

  logger.info('Upload cleanup complete', { deleted: expired.length });
}

async function deleteUpload(uploadId: string): Promise<void> {
  const upload = await db.uploads.findById(uploadId);
  if (!upload) return;

  // Delete files
  const baseDir = path.dirname(path.join(config.uploadsDir, upload.storagePath));
  await fs.rm(baseDir, { recursive: true, force: true });

  // Delete database record
  await db.uploads.delete(uploadId);
}
```

### Manual Deletion

```typescript
// DELETE /api/v1/uploads/:uploadId
async function deleteUploadEndpoint(ctx: Context): Promise<void> {
  const { uploadId } = ctx.req.param();

  // Check permissions (only admin or message owner)
  const upload = await db.uploads.findById(uploadId);
  if (!upload) {
    ctx.status = 404;
    return;
  }

  if (!await canDeleteUpload(ctx.state.user, upload)) {
    ctx.status = 403;
    return;
  }

  await deleteUpload(uploadId);

  ctx.status = 204;
}
```

---

## Channel-Specific Handling

### WhatsApp Media

```typescript
async function downloadWhatsAppMedia(mediaId: string): Promise<Buffer> {
  // Get media URL from WhatsApp API
  const mediaUrl = await whatsappApi.getMediaUrl(mediaId);

  // Download with authentication
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function handleWhatsAppMediaMessage(
  message: WhatsAppMessage
): Promise<void> {
  const mediaId = message.image?.id || message.document?.id || message.audio?.id;
  if (!mediaId) return;

  // Download media
  const buffer = await downloadWhatsAppMedia(mediaId);

  // Store locally
  await storeUpload(buffer, {
    messageId: message.id,
    filename: message.document?.filename || `${mediaId}.${getExtension(message)}`,
    mimeType: message.image?.mime_type || message.document?.mime_type || 'application/octet-stream',
  });
}
```

### Email Attachments

```typescript
async function handleEmailAttachments(
  email: ParsedEmail,
  messageId: string
): Promise<void> {
  for (const attachment of email.attachments) {
    // Validate
    const validation = await validateUpload(
      { type: attachment.contentType, size: attachment.size, name: attachment.filename },
      attachment.content
    );

    if (!validation.isValid) {
      logger.warn('Email attachment rejected', {
        filename: attachment.filename,
        error: validation.error,
      });
      continue;
    }

    // Store
    await storeUpload(attachment.content, {
      messageId,
      filename: validation.sanitizedFilename!,
      mimeType: validation.mimeType!,
    });
  }
}
```

---

## Configuration

```yaml
uploads:
  # Storage
  directory: "./data/uploads"
  maxTotalSize: "10GB"           # Total storage limit

  # Limits
  maxFileSize: "50MB"            # Default max per file
  maxFilesPerMessage: 10

  # Virus scanning
  scanning:
    enabled: true
    engine: "clamav"
    socket: "/var/run/clamav/clamd.ctl"
    quarantineInfected: true

  # Processing
  processing:
    images:
      thumbnailSize: 150
      mediumSize: 800
      quality: 85
    transcription:
      enabled: false
      provider: "whisper"

  # Retention
  retention:
    messageUploads: 365          # Days
    tempFiles: 24                # Hours
    exports: 7                   # Days

  # Security
  security:
    signedUrls: false
    urlExpiry: 3600              # Seconds
```

---

## Related

- [WhatsApp Channel](../integrations/whatsapp-channel.md) - WhatsApp media handling
- [Gateway API](../api/gateway-api.md) - Upload endpoints
- [Job Scheduler](../../03-architecture/decisions/005-job-scheduler.md) - Cleanup jobs
