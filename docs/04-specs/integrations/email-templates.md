# Email Template System

This document defines the email templating system for Jack The Butler.

---

## Overview

Jack uses a template system for transactional and marketing emails. Templates support:
- Variable substitution
- Conditional content
- Multi-language support
- HTML and plain text versions

---

## Template Engine

### Choice: Handlebars

We use **Handlebars** for email templates because:
- Simple syntax, easy to learn
- Safe (no arbitrary code execution)
- Wide ecosystem and editor support
- Works server-side (no JSX complexity)

### Setup

```typescript
import Handlebars from 'handlebars';
import mjml2html from 'mjml';

// Register custom helpers
Handlebars.registerHelper('formatDate', (date: Date, format: string) => {
  return formatDate(date, format);
});

Handlebars.registerHelper('formatCurrency', (amount: number, currency: string) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
});

Handlebars.registerHelper('pluralize', (count: number, singular: string, plural: string) => {
  return count === 1 ? singular : plural;
});
```

---

## Template Storage

### Directory Structure

```
knowledge/
└── templates/
    └── email/
        ├── transactional/
        │   ├── welcome.mjml
        │   ├── reservation-confirmation.mjml
        │   ├── checkout-reminder.mjml
        │   └── feedback-request.mjml
        ├── notifications/
        │   ├── task-assigned.mjml
        │   ├── escalation-alert.mjml
        │   └── daily-summary.mjml
        └── layouts/
            ├── base.mjml
            └── plain.txt
```

### Template Database

```sql
CREATE TABLE email_templates (
  id TEXT PRIMARY KEY,            -- tmpl_xxx
  name TEXT NOT NULL UNIQUE,      -- e.g., "welcome", "checkout-reminder"
  category TEXT NOT NULL,         -- transactional | notification | marketing
  subject TEXT NOT NULL,          -- Email subject (supports variables)
  body_mjml TEXT NOT NULL,        -- MJML source
  body_html TEXT,                 -- Compiled HTML (cached)
  body_text TEXT,                 -- Plain text version
  variables JSON NOT NULL,        -- Expected variables schema
  version INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT REFERENCES staff(id)
);

CREATE TABLE email_template_versions (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES email_templates(id),
  version INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body_mjml TEXT NOT NULL,
  body_text TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT REFERENCES staff(id),

  UNIQUE(template_id, version)
);
```

---

## Template Format

### MJML Structure

MJML (Mailjet Markup Language) compiles to responsive HTML email:

```xml
<!-- templates/email/transactional/welcome.mjml -->
<mjml>
  <mj-head>
    <mj-title>Welcome to {{propertyName}}</mj-title>
    <mj-preview>Your stay begins {{formatDate checkInDate "MMMM d"}}</mj-preview>
    <mj-attributes>
      <mj-all font-family="Arial, sans-serif" />
      <mj-text font-size="14px" line-height="1.5" />
    </mj-attributes>
    <mj-style>
      .highlight { background-color: #f5f5f5; padding: 15px; }
    </mj-style>
  </mj-head>

  <mj-body background-color="#f4f4f4">
    <!-- Header -->
    <mj-section background-color="#ffffff">
      <mj-column>
        <mj-image src="{{propertyLogo}}" alt="{{propertyName}}" width="150px" />
      </mj-column>
    </mj-section>

    <!-- Greeting -->
    <mj-section background-color="#ffffff">
      <mj-column>
        <mj-text font-size="24px" color="#333333">
          Welcome, {{guestName}}!
        </mj-text>
        <mj-text>
          We're excited to host you at {{propertyName}}. Here are your reservation details:
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- Reservation Details -->
    <mj-section background-color="#ffffff">
      <mj-column>
        <mj-table>
          <tr>
            <td style="padding: 10px;">Check-in</td>
            <td style="padding: 10px; font-weight: bold;">{{formatDate checkInDate "EEEE, MMMM d, yyyy"}}</td>
          </tr>
          <tr>
            <td style="padding: 10px;">Check-out</td>
            <td style="padding: 10px; font-weight: bold;">{{formatDate checkOutDate "EEEE, MMMM d, yyyy"}}</td>
          </tr>
          <tr>
            <td style="padding: 10px;">Room Type</td>
            <td style="padding: 10px; font-weight: bold;">{{roomType}}</td>
          </tr>
          {{#if roomNumber}}
          <tr>
            <td style="padding: 10px;">Room Number</td>
            <td style="padding: 10px; font-weight: bold;">{{roomNumber}}</td>
          </tr>
          {{/if}}
          <tr>
            <td style="padding: 10px;">Guests</td>
            <td style="padding: 10px; font-weight: bold;">{{adults}} {{pluralize adults "adult" "adults"}}{{#if children}}, {{children}} {{pluralize children "child" "children"}}{{/if}}</td>
          </tr>
        </mj-table>
      </mj-column>
    </mj-section>

    {{#if specialRequests}}
    <!-- Special Requests -->
    <mj-section background-color="#ffffff">
      <mj-column>
        <mj-text font-weight="bold">Your Special Requests:</mj-text>
        <mj-text css-class="highlight">{{specialRequests}}</mj-text>
      </mj-column>
    </mj-section>
    {{/if}}

    <!-- CTA -->
    <mj-section background-color="#ffffff">
      <mj-column>
        <mj-text>
          Have questions before your arrival? Simply reply to this email or message us on WhatsApp.
        </mj-text>
        <mj-button background-color="#007bff" href="{{chatLink}}">
          Chat with Us
        </mj-button>
      </mj-column>
    </mj-section>

    <!-- Footer -->
    <mj-section background-color="#333333">
      <mj-column>
        <mj-text color="#ffffff" font-size="12px" align="center">
          {{propertyName}}<br />
          {{propertyAddress}}<br />
          {{propertyPhone}}
        </mj-text>
        <mj-text color="#888888" font-size="10px" align="center">
          <a href="{{unsubscribeLink}}" style="color: #888888;">Unsubscribe</a>
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

### Plain Text Version

```handlebars
{{!-- templates/email/transactional/welcome.txt --}}
Welcome to {{propertyName}}, {{guestName}}!

We're excited to host you. Here are your reservation details:

Check-in: {{formatDate checkInDate "EEEE, MMMM d, yyyy"}}
Check-out: {{formatDate checkOutDate "EEEE, MMMM d, yyyy"}}
Room Type: {{roomType}}
{{#if roomNumber}}Room Number: {{roomNumber}}{{/if}}
Guests: {{adults}} {{pluralize adults "adult" "adults"}}{{#if children}}, {{children}} {{pluralize children "child" "children"}}{{/if}}

{{#if specialRequests}}
Your Special Requests:
{{specialRequests}}
{{/if}}

Have questions? Reply to this email or visit: {{chatLink}}

---
{{propertyName}}
{{propertyAddress}}
{{propertyPhone}}

Unsubscribe: {{unsubscribeLink}}
```

---

## Variable Schema

Each template defines expected variables:

```typescript
interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: any;
  description?: string;
}

// Example for welcome template
const WELCOME_VARIABLES: TemplateVariable[] = [
  { name: 'guestName', type: 'string', required: true },
  { name: 'propertyName', type: 'string', required: true },
  { name: 'propertyLogo', type: 'string', required: true },
  { name: 'propertyAddress', type: 'string', required: true },
  { name: 'propertyPhone', type: 'string', required: true },
  { name: 'checkInDate', type: 'date', required: true },
  { name: 'checkOutDate', type: 'date', required: true },
  { name: 'roomType', type: 'string', required: true },
  { name: 'roomNumber', type: 'string', required: false },
  { name: 'adults', type: 'number', required: true, default: 1 },
  { name: 'children', type: 'number', required: false, default: 0 },
  { name: 'specialRequests', type: 'string', required: false },
  { name: 'chatLink', type: 'string', required: true },
  { name: 'unsubscribeLink', type: 'string', required: true },
];
```

---

## Template Rendering

### Render Pipeline

```typescript
interface RenderOptions {
  templateName: string;
  variables: Record<string, any>;
  language?: string;
  format?: 'html' | 'text' | 'both';
}

interface RenderedEmail {
  subject: string;
  html?: string;
  text?: string;
}

class EmailTemplateRenderer {
  private compiledCache = new Map<string, HandlebarsTemplateDelegate>();

  async render(options: RenderOptions): Promise<RenderedEmail> {
    const { templateName, variables, language = 'en', format = 'both' } = options;

    // Get template
    const template = await this.getTemplate(templateName, language);

    // Validate variables
    this.validateVariables(template.variables, variables);

    // Add default variables
    const allVariables = {
      ...this.getDefaultVariables(),
      ...variables,
    };

    // Render subject
    const subjectTemplate = this.compile(template.subject);
    const subject = subjectTemplate(allVariables);

    const result: RenderedEmail = { subject };

    // Render HTML (compile MJML first)
    if (format === 'html' || format === 'both') {
      const htmlTemplate = this.compile(template.body_html || this.compileMJML(template.body_mjml));
      result.html = htmlTemplate(allVariables);
    }

    // Render plain text
    if (format === 'text' || format === 'both') {
      const textTemplate = this.compile(template.body_text);
      result.text = textTemplate(allVariables);
    }

    return result;
  }

  private compile(source: string): HandlebarsTemplateDelegate {
    const cacheKey = hashString(source);

    if (!this.compiledCache.has(cacheKey)) {
      this.compiledCache.set(cacheKey, Handlebars.compile(source));
    }

    return this.compiledCache.get(cacheKey)!;
  }

  private compileMJML(mjml: string): string {
    const result = mjml2html(mjml, {
      validationLevel: 'soft',
      minify: true,
    });

    if (result.errors.length > 0) {
      logger.warn('MJML compilation warnings', { errors: result.errors });
    }

    return result.html;
  }

  private validateVariables(
    schema: TemplateVariable[],
    variables: Record<string, any>
  ): void {
    for (const field of schema) {
      if (field.required && !(field.name in variables)) {
        throw new Error(`Missing required variable: ${field.name}`);
      }
    }
  }

  private getDefaultVariables(): Record<string, any> {
    return {
      currentYear: new Date().getFullYear(),
      supportEmail: config.supportEmail,
    };
  }
}
```

---

## Multi-Language Support

### Language-Specific Templates

```
templates/
└── email/
    └── transactional/
        ├── welcome.mjml           # Default (English)
        ├── welcome.es.mjml        # Spanish
        ├── welcome.fr.mjml        # French
        └── welcome.de.mjml        # German
```

### Language Resolution

```typescript
async function getTemplate(name: string, language: string): Promise<EmailTemplate> {
  // Try language-specific first
  let template = await db.templates.findByName(`${name}.${language}`);

  // Fall back to default
  if (!template) {
    template = await db.templates.findByName(name);
  }

  if (!template) {
    throw new Error(`Template not found: ${name}`);
  }

  return template;
}
```

---

## Template Management

### Create Template

```typescript
async function createTemplate(data: CreateTemplateInput): Promise<EmailTemplate> {
  // Validate MJML syntax
  const mjmlResult = mjml2html(data.bodyMjml, { validationLevel: 'strict' });
  if (mjmlResult.errors.length > 0) {
    throw new ValidationError('Invalid MJML', { errors: mjmlResult.errors });
  }

  // Create template
  const template = await db.templates.create({
    id: generateId('tmpl'),
    name: data.name,
    category: data.category,
    subject: data.subject,
    body_mjml: data.bodyMjml,
    body_html: mjmlResult.html,
    body_text: data.bodyText,
    variables: JSON.stringify(data.variables),
    version: 1,
    is_active: true,
    created_by: data.createdBy,
  });

  return template;
}
```

### Update Template (With Versioning)

```typescript
async function updateTemplate(
  id: string,
  data: UpdateTemplateInput,
  updatedBy: string
): Promise<EmailTemplate> {
  const existing = await db.templates.findById(id);

  // Save current version to history
  await db.templateVersions.create({
    id: generateId('tv'),
    template_id: id,
    version: existing.version,
    subject: existing.subject,
    body_mjml: existing.body_mjml,
    body_text: existing.body_text,
    created_by: updatedBy,
  });

  // Update template
  const updated = await db.templates.update(id, {
    ...data,
    body_html: data.bodyMjml ? mjml2html(data.bodyMjml).html : undefined,
    version: existing.version + 1,
    updated_at: new Date(),
  });

  // Clear compiled cache
  templateRenderer.clearCache(id);

  return updated;
}
```

### Rollback Template

```typescript
async function rollbackTemplate(
  id: string,
  targetVersion: number,
  rolledBackBy: string
): Promise<EmailTemplate> {
  const version = await db.templateVersions.find({
    template_id: id,
    version: targetVersion,
  });

  if (!version) {
    throw new NotFoundError(`Version ${targetVersion} not found`);
  }

  return updateTemplate(id, {
    subject: version.subject,
    bodyMjml: version.body_mjml,
    bodyText: version.body_text,
  }, rolledBackBy);
}
```

---

## Preview and Testing

### Template Preview

```typescript
// API endpoint for template preview
app.post('/templates/:id/preview', async (ctx) => {
  const { id } = ctx.params;
  const { variables } = ctx.request.body;

  const template = await db.templates.findById(id);

  // Use sample data if no variables provided
  const previewVariables = variables || getSampleVariables(template.name);

  const rendered = await templateRenderer.render({
    templateName: template.name,
    variables: previewVariables,
    format: 'both',
  });

  ctx.body = {
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    variables: previewVariables,
  };
});
```

### Send Test Email

```typescript
app.post('/templates/:id/test', async (ctx) => {
  const { id } = ctx.params;
  const { email, variables } = ctx.request.body;

  const template = await db.templates.findById(id);

  const rendered = await templateRenderer.render({
    templateName: template.name,
    variables: variables || getSampleVariables(template.name),
  });

  await emailService.send({
    to: email,
    subject: `[TEST] ${rendered.subject}`,
    html: rendered.html,
    text: rendered.text,
  });

  ctx.body = { success: true, sentTo: email };
});
```

---

## Built-in Templates

### Transactional Templates

| Name | Trigger | Variables |
|------|---------|-----------|
| `welcome` | Guest identified | guestName, checkInDate, roomType |
| `reservation-confirmation` | Booking created | All reservation details |
| `checkout-reminder` | 1 day before checkout | guestName, checkOutDate, balance |
| `feedback-request` | After checkout | guestName, stayDates, feedbackLink |
| `receipt` | Payment processed | Amount, items, paymentMethod |

### Notification Templates (Staff)

| Name | Trigger | Variables |
|------|---------|-----------|
| `task-assigned` | Task assigned | taskTitle, guestName, priority |
| `escalation-alert` | Conversation escalated | guestName, reason, conversationLink |
| `daily-summary` | Daily 8 AM | Stats, pendingTasks, arrivals |
| `vip-arrival` | VIP check-in | guestName, loyaltyTier, preferences |

---

## Configuration

```yaml
email:
  templates:
    # Storage
    storage: database            # database | filesystem
    basePath: knowledge/templates/email

    # Compilation
    mjml:
      validationLevel: soft
      minify: true

    # Caching
    cache:
      enabled: true
      ttl: 3600                  # 1 hour

    # Languages
    defaultLanguage: en
    supportedLanguages:
      - en
      - es
      - fr
      - de

    # Preview
    sampleDataPath: config/template-samples.json
```

---

## Related

- [Email Channel](email-channel.md) - Email sending
- [Notification Scheduling](../features/notifications.md) - When emails are sent
- [Knowledge Base](../../03-architecture/c4-components/ai-engine.md#knowledge-base-management) - Template storage
