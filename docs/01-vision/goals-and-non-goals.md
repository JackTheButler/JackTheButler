# Goals and Non-Goals

This document defines explicit boundaries for Jack The Butler to guide decision-making and prevent scope creep.

---

## Goals

### G1: Unified Guest Communication
Provide a single platform that aggregates guest messages from all channels (WhatsApp, SMS, web chat, email, voice) into one intelligent interface.

**Success criteria:**
- Support minimum 5 communication channels at launch
- Messages appear in unified inbox within 2 seconds
- Conversation context persists across channel switches

### G2: Autonomous Request Handling
Enable Jack to understand and fulfill common guest requests without human intervention.

**Success criteria:**
- Handle 70%+ of routine requests autonomously
- Accurately classify request intent with 95%+ accuracy
- Execute actions in connected systems (PMS, housekeeping, etc.)

### G3: Intelligent Staff Augmentation
When human involvement is needed, provide staff with complete context and recommended actions.

**Success criteria:**
- Staff see full conversation history and guest profile
- AI suggests responses for staff review
- Escalation routing based on request type and urgency

### G4: Guest Memory & Personalization
Remember guest preferences across stays to deliver personalized service.

**Success criteria:**
- Maintain preference profiles linked to guest identity
- Surface relevant history at conversation start
- Learn from interactions to improve personalization

### G5: Hotel System Integration
Connect deeply with property management and operational systems.

**Success criteria:**
- Bi-directional sync with major PMS platforms
- Real-time room status and availability
- Automated task creation in housekeeping/maintenance systems

### G6: Multi-Property Support
Enable hotel groups to deploy Jack across properties with shared guest profiles.

**Success criteria:**
- Centralized guest database with property-level access
- Property-specific configurations and branding
- Cross-property preference portability

### G7: Self-Hosted Option
Allow hotels to run Jack on their own infrastructure for data sovereignty.

**Success criteria:**
- Docker-based deployment option
- All data stored in hotel-controlled databases
- Fully offline capable with local AI (Transformers.js), no external API calls required

### G8: Configurable Autonomy & Review Center
Give hotels granular control over what Jack can do autonomously versus what requires staff approval.

**Success criteria:**
- Configurable autonomy levels controlling AI decision-making scope
- Review center where staff approve or reject actions that exceed the current autonomy level
- Clear audit trail of all autonomous and reviewed actions

### G9: Hotel Knowledge Base
Enable hotels to teach Jack their specific policies, FAQs, amenities, and procedures so responses are grounded in accurate, property-specific information.

**Success criteria:**
- Staff can add, edit, and organize knowledge base entries
- Site scraper to import content from hotel website automatically
- Semantic search via embeddings (RAG) to surface relevant knowledge in AI responses

---

## Non-Goals

### NG1: Primary Booking Engine
Jack is not intended to be the primary channel for new reservations. While Jack can assist with booking modifications and upsells, initial reservations flow through existing booking channels (website, OTAs, direct).

**Why:** Hotels have established booking flows with revenue management, rate parity, and commission structures. Jack adding another booking path creates complexity.

### NG2: Marketing Automation
Jack will not send unsolicited promotional messages or be used for marketing campaigns.

**Why:** Guest trust requires that Jack serves their needs, not hotel sales goals. Marketing via Jack would erode the butler relationship.

### NG3: Surveillance or Tracking
Jack will not track guest location, monitor guest behavior beyond direct interactions, or build profiles for purposes other than service delivery.

**Why:** Privacy is a core principle. Data collection is limited to what's needed for hospitality service.

### NG4: Full Staff Replacement
Jack is explicitly not designed to eliminate hospitality jobs. The goal is augmentation—handling routine tasks so staff can focus on high-touch interactions.

**Why:** Great hospitality requires human connection. Jack handles the "could be automated" so humans can focus on the "should be personal."

### NG5: Generic AI Assistant
Jack will not attempt to be a general-purpose assistant (weather, news, general knowledge). Focus remains on hospitality-specific capabilities.

**Why:** Scope discipline. Generic assistant features dilute the hospitality-native value proposition.

### NG6: Real-Time Translation Service
While Jack can communicate in multiple languages, it's not a translation service for staff-guest conversations.

**Why:** Translation is a feature of Jack's responses, not a standalone capability.

### NG7: Payment Processing
Jack will not directly handle credit card numbers or process payments. Payment-related requests route to secure hotel systems.

**Why:** PCI compliance complexity. Hotels have existing payment infrastructure.

---

## Boundary Cases

These items are neither clear goals nor non-goals. Decisions will be made as the product evolves.

| Item | Consideration |
|------|---------------|
| **Voice AI for phone calls** | High value but complex. May be Phase 2. |
| **In-room device integration** | Smart speaker/tablet interface. Depends on hardware partnerships. |
| **Review response drafting** | Useful but risks crossing into marketing territory. |
| **Revenue management input** | AI could inform pricing, but this extends beyond guest service. |
| **Staff scheduling assistance** | Valuable for operations but different user base. |

---

## Decision Framework

When evaluating new features, apply this test:

1. **Does it directly improve guest experience?** If no, deprioritize.
2. **Does it require guest data beyond service needs?** If yes, reject.
3. **Does it replace human judgment in sensitive situations?** If yes, ensure escalation path.
4. **Does it work across all supported channels?** If no, consider scope.
5. **Does it integrate with existing hotel workflows?** If no, assess adoption risk.

---

## Related

- [Overview](overview.md)
- [Use Cases](../02-use-cases/) - Concrete examples of goals in action
