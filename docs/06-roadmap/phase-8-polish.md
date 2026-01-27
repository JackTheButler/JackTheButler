# Phase 8: Polish

**Version:** 0.9.0
**Codename:** Polish
**Goal:** Multi-channel, automation, and P0 feature completion

---

## Overview

Phase 8 completes all P0 features. After this phase:

1. SMS channel working (Twilio)
2. Email channel working
3. Automation rules engine
4. Escalation system refined
5. **All P0 use cases complete**

---

## Prerequisites

- Phase 7 complete (PMS integration working)
- Twilio account for SMS
- SMTP/IMAP credentials for email

---

## Deliverables

### 0.9.0-alpha.1: SMS Channel (Twilio)

**Files to create:**

```
src/channels/sms/
├── index.ts                  # SMS adapter
├── api.ts                    # Twilio client
└── webhook.ts                # Twilio webhook handler
```

**SMS adapter:**

```typescript
// src/channels/sms/index.ts
import twilio from 'twilio';

export class SMSAdapter implements ChannelAdapter {
  readonly channel: ChannelType = 'sms';
  private client: twilio.Twilio;

  constructor(config: TwilioConfig, private processor: MessageProcessor) {
    this.client = twilio(config.accountSid, config.authToken);
  }

  async handleWebhook(body: TwilioWebhookBody): Promise<void> {
    const inbound: InboundMessage = {
      id: body.MessageSid,
      channel: 'sms',
      channelId: body.From,
      content: body.Body,
      contentType: 'text',
      timestamp: new Date(),
      raw: body,
    };

    const response = await this.processor.process(inbound);
    await this.send(body.From, response);
  }

  async send(to: string, message: OutboundMessage): Promise<SendResult> {
    const result = await this.client.messages.create({
      to,
      from: this.config.phoneNumber,
      body: message.content,
    });

    return {
      channelMessageId: result.sid,
      status: 'sent',
    };
  }
}
```

**Webhook route:**

```typescript
// src/gateway/routes/webhooks/twilio.ts
webhook.post('/', async (c) => {
  // Validate Twilio signature
  const signature = c.req.header('x-twilio-signature');
  if (!validateTwilioSignature(signature, body)) {
    return c.text('Invalid signature', 401);
  }

  await smsAdapter.handleWebhook(body);
  return c.text('OK');
});
```

**Acceptance criteria:**
- [ ] Twilio webhook receives messages
- [ ] Messages processed through pipeline
- [ ] Responses sent via Twilio
- [ ] Phone numbers normalized

---

### 0.9.0-alpha.2: Email Channel

**Files to create:**

```
src/channels/email/
├── index.ts                  # Email adapter
├── sender.ts                 # SMTP sender
├── receiver.ts               # IMAP receiver
├── parser.ts                 # Email parsing
└── templates/                # Email templates
    └── reply.html
```

**Email adapter:**

```typescript
// src/channels/email/index.ts
import nodemailer from 'nodemailer';
import Imap from 'imap';

export class EmailAdapter implements ChannelAdapter {
  readonly channel: ChannelType = 'email';

  constructor(
    private sender: EmailSender,
    private receiver: EmailReceiver,
    private processor: MessageProcessor
  ) {
    this.receiver.on('message', this.handleInbound.bind(this));
  }

  private async handleInbound(email: ParsedEmail): Promise<void> {
    const inbound: InboundMessage = {
      id: email.messageId,
      channel: 'email',
      channelId: email.from.address,
      content: email.textBody || email.htmlBody,
      contentType: 'text',
      timestamp: email.date,
      raw: email,
    };

    const response = await this.processor.process(inbound);
    await this.send(email.from.address, response, email);
  }

  async send(to: string, message: OutboundMessage, replyTo?: ParsedEmail): Promise<SendResult> {
    const result = await this.sender.send({
      to,
      subject: replyTo ? `Re: ${replyTo.subject}` : 'Message from Jack The Butler',
      html: renderTemplate('reply', { content: message.content }),
      inReplyTo: replyTo?.messageId,
      references: replyTo?.references,
    });

    return { channelMessageId: result.messageId, status: 'sent' };
  }
}
```

**Acceptance criteria:**
- [ ] IMAP polls for new emails
- [ ] Emails processed through pipeline
- [ ] Replies sent via SMTP
- [ ] Email threading works (In-Reply-To)

---

### 0.9.0-alpha.3: Automation Rules Engine

**Create table (migration):**

```sql
CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_config TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Files to create:**

```
src/automation/
├── index.ts                  # Automation engine
├── types.ts                  # Rule types
├── triggers.ts               # Trigger handlers
├── actions.ts                # Action executors
└── rules/
    ├── pre-arrival.ts        # Pre-arrival messaging
    └── checkout-reminder.ts  # Checkout reminder
```

**Automation engine:**

```typescript
// src/automation/index.ts
export class AutomationEngine {
  constructor(
    private db: Database,
    private actions: ActionExecutor
  ) {}

  async evaluate(event: AutomationEvent): Promise<void> {
    // Find matching rules
    const rules = await this.db.select()
      .from(automationRules)
      .where(eq(automationRules.enabled, true));

    for (const rule of rules) {
      if (this.matchesTrigger(rule, event)) {
        await this.actions.execute(rule.actionType, rule.actionConfig, event);
      }
    }
  }

  private matchesTrigger(rule: AutomationRule, event: AutomationEvent): boolean {
    const config = JSON.parse(rule.triggerConfig);

    switch (rule.triggerType) {
      case 'time_based':
        return this.matchesTimeTrigger(config, event);
      case 'event_based':
        return config.eventType === event.type;
      default:
        return false;
    }
  }
}
```

**Pre-arrival rule:**

```typescript
// src/automation/rules/pre-arrival.ts
export const preArrivalRule: AutomationRuleConfig = {
  name: 'Pre-arrival Welcome',
  triggerType: 'time_based',
  triggerConfig: {
    type: 'before_arrival',
    offsetDays: -3,
    time: '10:00',
  },
  actionType: 'send_message',
  actionConfig: {
    template: 'pre_arrival_welcome',
    channel: 'preferred', // Use guest's preferred channel
  },
};
```

**Acceptance criteria:**
- [ ] Rules can be defined in database
- [ ] Time-based triggers fire correctly
- [ ] Event-based triggers work
- [ ] Actions execute (send message, create task)

---

### 0.9.0-alpha.4: Escalation Refinement

**Enhance escalation logic:**

```typescript
// src/ai/escalation.ts
export class EscalationManager {
  async shouldEscalate(
    conversation: Conversation,
    message: InboundMessage,
    classification: ClassificationResult
  ): Promise<EscalationDecision> {
    const reasons: string[] = [];

    // 1. Low confidence
    if (classification.confidence < this.config.confidenceThreshold) {
      reasons.push('Low AI confidence');
    }

    // 2. Explicit request
    if (this.detectEscalationRequest(message.content)) {
      reasons.push('Guest requested human');
    }

    // 3. Negative sentiment
    const sentiment = await this.analyzeSentiment(message.content);
    if (sentiment.score < -0.5) {
      reasons.push('Negative sentiment detected');
    }

    // 4. Repeated similar messages (frustration)
    const recentMessages = await this.getRecentMessages(conversation.id, 5);
    if (this.detectRepetition(recentMessages)) {
      reasons.push('Guest repeating request');
    }

    // 5. VIP guest
    if (conversation.guest?.vipStatus) {
      reasons.push('VIP guest');
    }

    return {
      shouldEscalate: reasons.length > 0,
      reasons,
      priority: this.calculatePriority(reasons),
    };
  }
}
```

**Acceptance criteria:**
- [ ] Multiple escalation triggers
- [ ] Escalation reasons logged
- [ ] Priority calculated
- [ ] Staff notified of escalation

---

### 0.9.0-alpha.5: P0 Use Case Validation

**Verify all P0 use cases work:**

| Use Case | Test Scenario |
|----------|---------------|
| G-01: Pre-arrival | Automation sends message 3 days before |
| G-02: Check-in | Guest asks about early check-in, AI responds |
| G-03: Service requests | "I need towels" → Task created |
| G-04: Information | "What time is the pool open?" → Correct answer |
| G-05: Complaints | "AC not working" → Task + escalation |
| G-08: Check-out | "What time is checkout?" → Answer with room |
| S-01: Conversation mgmt | Staff sees all conversations |
| S-02: Task management | Staff can claim/complete tasks |

**End-to-end test script:**

```typescript
// tests/e2e/p0-use-cases.test.ts
describe('P0 Use Cases', () => {
  it('G-01: Pre-arrival messaging', async () => {
    // Create reservation arriving in 3 days
    // Run automation job
    // Verify message sent
  });

  it('G-03: Service request creates task', async () => {
    // Send "I need extra towels"
    // Verify AI acknowledges
    // Verify task created with type=housekeeping
  });

  it('G-05: Complaint triggers escalation', async () => {
    // Send "The AC is broken and I'm very upset"
    // Verify task created
    // Verify escalation triggered
    // Verify staff notified
  });

  // ... more tests
});
```

**Acceptance criteria:**
- [ ] All 8 P0 use cases pass e2e tests
- [ ] Automation rules fire correctly
- [ ] Tasks created appropriately
- [ ] Escalation works reliably

---

## Testing Checkpoint

### Multi-Channel Test

1. Send WhatsApp message → Get response
2. Send SMS message → Get response
3. Send Email → Get response
4. Verify all create same conversation context

### Automation Test

1. Create reservation for tomorrow
2. Wait for pre-arrival automation (or trigger manually)
3. Verify message sent to guest

### Stakeholder Demo

**Demo script:**
1. Show all channels working (WhatsApp, SMS, Email)
2. Show automation rule sending pre-arrival message
3. Show escalation when guest is upset
4. Run through all P0 use cases
5. Show dashboard with multi-channel conversation

**Key message:** "All core features are working. Ready for final testing."

---

## Exit Criteria

Phase 8 is complete when:

1. **SMS channel** working via Twilio
2. **Email channel** working via SMTP/IMAP
3. **Automation rules** fire correctly
4. **Escalation** triggers on multiple conditions
5. **All P0 use cases** pass validation

---

## Dependencies

**Add to package.json:**

```json
{
  "dependencies": {
    "twilio": "^5.3.0",
    "nodemailer": "^6.9.0",
    "imap": "^0.8.0",
    "mailparser": "^3.7.0"
  },
  "devDependencies": {
    "@types/nodemailer": "^6.4.0",
    "@types/imap": "^0.8.0"
  }
}
```

---

## Next Phase

After Phase 8, proceed to [Phase 9: Launch](phase-9-launch.md) for production hardening.

---

## Checklist for Claude Code

```markdown
## Phase 8 Implementation Checklist

### 0.9.0-alpha.1: SMS Channel
- [ ] Install twilio
- [ ] Create src/channels/sms/
- [ ] Implement webhook handler
- [ ] Implement send method
- [ ] Verify: SMS works end-to-end

### 0.9.0-alpha.2: Email Channel
- [ ] Install nodemailer, imap, mailparser
- [ ] Create src/channels/email/
- [ ] Implement IMAP receiver
- [ ] Implement SMTP sender
- [ ] Verify: Email works end-to-end

### 0.9.0-alpha.3: Automation Engine
- [ ] Create src/automation/
- [ ] Implement rule matching
- [ ] Implement action execution
- [ ] Create pre-arrival rule
- [ ] Verify: Automation fires

### 0.9.0-alpha.4: Escalation
- [ ] Implement multiple triggers
- [ ] Add sentiment analysis
- [ ] Add repetition detection
- [ ] Add VIP detection
- [ ] Verify: Escalation works

### 0.9.0-alpha.5: P0 Validation
- [ ] Test G-01: Pre-arrival
- [ ] Test G-02: Check-in
- [ ] Test G-03: Service requests
- [ ] Test G-04: Information
- [ ] Test G-05: Complaints
- [ ] Test G-08: Check-out
- [ ] Test S-01: Conversation management
- [ ] Test S-02: Task management
- [ ] All P0 use cases pass

### Phase 8 Complete
- [ ] All checks above pass
- [ ] All P0 use cases validated
- [ ] Commit: "Phase 8: Feature complete"
- [ ] Tag: v0.9.0
```
