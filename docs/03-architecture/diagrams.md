# Architecture Diagrams

This document provides visual architecture diagrams for Jack The Butler using Mermaid notation.

---

## C4 Context Diagram

The system context showing Jack's position in the broader ecosystem:

```mermaid
C4Context
    title System Context Diagram - Jack The Butler

    Person(guest, "Guest", "Hotel guest communicating via WhatsApp, SMS, Email, or Web Chat")
    Person(staff, "Hotel Staff", "Front desk, concierge, housekeeping, maintenance")

    System(jack, "Jack The Butler", "AI-powered hospitality assistant handling guest communication and task routing")

    System_Ext(whatsapp, "WhatsApp Business", "Meta's business messaging platform")
    System_Ext(twilio, "Twilio", "SMS and voice communication platform")
    System_Ext(email, "Email Server", "SMTP for outbound, IMAP for inbound")
    System_Ext(pms, "Property Management System", "Opera, Mews, Cloudbeds, etc.")
    System_Ext(ai, "AI Providers", "Claude API, OpenAI, Ollama")

    Rel(guest, jack, "Sends messages", "WhatsApp/SMS/Email/WebChat")
    Rel(jack, guest, "Sends responses", "WhatsApp/SMS/Email/WebChat")
    Rel(staff, jack, "Manages conversations, completes tasks", "Web Dashboard")
    Rel(jack, staff, "Notifications, escalations", "WebSocket/Email")

    Rel(jack, whatsapp, "Sends/receives messages", "Graph API")
    Rel(jack, twilio, "Sends/receives SMS", "REST API")
    Rel(jack, email, "Sends/receives email", "SMTP/IMAP")
    Rel(jack, pms, "Syncs guest data, reservations", "REST API")
    Rel(jack, ai, "Intent classification, response generation", "REST API")
```

---

## C4 Container Diagram

The main containers/components within Jack:

```mermaid
C4Container
    title Container Diagram - Jack The Butler

    Person(guest, "Guest", "Hotel guest")
    Person(staff, "Hotel Staff", "Property employees")

    System_Boundary(jack, "Jack The Butler") {
        Container(gateway, "Gateway", "Hono/Node.js", "HTTP API and WebSocket server")
        Container(channels, "Channel Adapters", "Node.js", "WhatsApp, Twilio, Email adapters")
        Container(ai_engine, "AI Engine", "Node.js", "Intent classification, RAG, response generation")
        Container(integrations, "Integration Layer", "Node.js", "PMS, housekeeping, billing connectors")
        Container(scheduler, "Job Scheduler", "Node.js", "Background tasks, cron jobs")
        ContainerDb(db, "SQLite Database", "SQLite + sqlite-vec", "Conversations, guests, tasks, embeddings")
        Container(dashboard, "Staff Dashboard", "React", "Web interface for staff")
        Container(widget, "Chat Widget", "JavaScript", "Embeddable web chat")
    }

    System_Ext(whatsapp, "WhatsApp", "Messaging")
    System_Ext(twilio, "Twilio", "SMS")
    System_Ext(pms, "PMS", "Hotel operations")
    System_Ext(claude, "Claude API", "AI provider")

    Rel(guest, channels, "Messages", "HTTPS/Webhooks")
    Rel(guest, widget, "Web chat", "WebSocket")
    Rel(staff, dashboard, "Uses", "HTTPS/WebSocket")

    Rel(channels, gateway, "Routes messages", "Internal")
    Rel(gateway, ai_engine, "Processes messages", "Internal")
    Rel(gateway, integrations, "Hotel operations", "Internal")
    Rel(gateway, db, "Reads/writes", "SQL")
    Rel(ai_engine, db, "Embeddings", "SQL")
    Rel(scheduler, db, "Job queue", "SQL")
    Rel(integrations, pms, "Syncs data", "REST")
    Rel(ai_engine, claude, "AI requests", "REST")
    Rel(channels, whatsapp, "Messages", "REST")
    Rel(channels, twilio, "Messages", "REST")
```

---

## Component Diagram - Gateway

```mermaid
flowchart TB
    subgraph Gateway["Gateway Component"]
        direction TB
        http["HTTP Server<br/>(Hono)"]
        ws["WebSocket Server<br/>(ws)"]
        router["Request Router"]
        auth["Auth Middleware"]
        rate["Rate Limiter"]
        val["Request Validator"]
    end

    subgraph Handlers["Request Handlers"]
        conv["Conversation Handler"]
        task["Task Handler"]
        guest["Guest Handler"]
        staff["Staff Handler"]
        webhook["Webhook Handler"]
        health["Health Handler"]
    end

    Client["Clients"] --> http
    Client --> ws
    http --> auth
    ws --> auth
    auth --> rate
    rate --> val
    val --> router

    router --> conv
    router --> task
    router --> guest
    router --> staff
    router --> webhook
    router --> health
```

---

## Component Diagram - AI Engine

```mermaid
flowchart TB
    subgraph AIEngine["AI Engine Component"]
        direction TB
        classifier["Intent Classifier"]
        generator["Response Generator"]
        rag["RAG Retriever"]
        memory["Guest Memory"]
        sentiment["Sentiment Analyzer"]
    end

    subgraph Providers["AI Providers"]
        claude["Claude API"]
        openai["OpenAI API"]
        ollama["Ollama (Local)"]
    end

    subgraph Storage["Storage"]
        db[(SQLite)]
        vectors[(Vector Index)]
        kb["Knowledge Base"]
    end

    Message["Inbound Message"] --> classifier
    classifier --> sentiment
    classifier --> rag
    rag --> vectors
    rag --> kb
    classifier --> memory
    memory --> db

    classifier --> generator
    generator --> claude
    claude -.->|"fallback"| openai
    openai -.->|"fallback"| ollama

    generator --> Response["AI Response"]
```

---

## Component Diagram - Channel Adapters

```mermaid
flowchart LR
    subgraph External["External Channels"]
        wa["WhatsApp<br/>Business API"]
        tw["Twilio<br/>SMS/Voice"]
        em["Email<br/>SMTP/IMAP"]
        wc["Web Chat<br/>WebSocket"]
    end

    subgraph Adapters["Channel Adapters"]
        direction TB
        wa_adapter["WhatsApp Adapter"]
        tw_adapter["Twilio Adapter"]
        em_adapter["Email Adapter"]
        wc_adapter["WebChat Adapter"]
    end

    subgraph Internal["Internal Format"]
        in_msg["Inbound Message"]
        out_msg["Outbound Message"]
    end

    wa -->|"Webhook"| wa_adapter
    tw -->|"Webhook"| tw_adapter
    em -->|"IMAP"| em_adapter
    wc -->|"WebSocket"| wc_adapter

    wa_adapter --> in_msg
    tw_adapter --> in_msg
    em_adapter --> in_msg
    wc_adapter --> in_msg

    out_msg --> wa_adapter
    out_msg --> tw_adapter
    out_msg --> em_adapter
    out_msg --> wc_adapter

    wa_adapter -->|"Graph API"| wa
    tw_adapter -->|"REST API"| tw
    em_adapter -->|"SMTP"| em
    wc_adapter -->|"WebSocket"| wc
```

---

## Sequence Diagram - Message Processing

```mermaid
sequenceDiagram
    participant Guest
    participant WhatsApp
    participant Gateway
    participant AIEngine
    participant VectorDB
    participant Claude

    Guest->>WhatsApp: Send message
    WhatsApp->>Gateway: Webhook POST
    Gateway->>Gateway: Validate signature
    Gateway->>Gateway: Parse message

    Gateway->>AIEngine: Process message
    AIEngine->>AIEngine: Classify intent
    AIEngine->>VectorDB: Search knowledge base
    VectorDB-->>AIEngine: Relevant context
    AIEngine->>Claude: Generate response
    Claude-->>AIEngine: AI response

    AIEngine-->>Gateway: Response
    Gateway->>WhatsApp: Send message
    WhatsApp->>Guest: Deliver message
    Gateway-->>WhatsApp: 200 OK
```

---

## Sequence Diagram - Escalation Flow

```mermaid
sequenceDiagram
    participant Guest
    participant Gateway
    participant AIEngine
    participant TaskService
    participant StaffDashboard
    participant Staff

    Guest->>Gateway: "I want to speak to someone"
    Gateway->>AIEngine: Process message
    AIEngine->>AIEngine: Detect escalation intent
    AIEngine->>AIEngine: Check confidence (low)

    AIEngine->>Gateway: Escalate required
    Gateway->>TaskService: Create escalation task
    TaskService->>TaskService: Find available staff
    TaskService->>TaskService: Assign to staff

    TaskService->>StaffDashboard: WebSocket notification
    StaffDashboard->>Staff: Show notification

    Staff->>StaffDashboard: Accept conversation
    StaffDashboard->>Gateway: Update assignment

    Gateway->>Guest: "Connecting you with Sarah..."

    Staff->>StaffDashboard: Send response
    StaffDashboard->>Gateway: Staff message
    Gateway->>Guest: Staff response
```

---

## Sequence Diagram - PMS Sync

```mermaid
sequenceDiagram
    participant Scheduler
    participant PMSIntegration
    participant PMS
    participant Database
    participant EventBus

    loop Every 5 minutes
        Scheduler->>PMSIntegration: Trigger sync
        PMSIntegration->>PMS: GET /reservations (modified since last sync)
        PMS-->>PMSIntegration: Reservation data

        loop Each reservation
            PMSIntegration->>Database: Check local record
            alt Record exists
                PMSIntegration->>PMSIntegration: Detect changes
                alt Has changes
                    PMSIntegration->>Database: Update record
                    PMSIntegration->>EventBus: Emit reservation.updated
                end
            else New record
                PMSIntegration->>Database: Insert record
                PMSIntegration->>EventBus: Emit reservation.created
            end
        end

        PMSIntegration->>Database: Update last sync time
    end
```

---

## State Diagram - Conversation

```mermaid
stateDiagram-v2
    [*] --> New: Guest sends first message

    New --> Active: AI processes message

    Active --> Escalated: Needs human
    Active --> Resolved: Issue resolved
    Active --> Closed: Timeout

    Escalated --> Active: Return to AI
    Escalated --> Transferred: Staff transfers
    Escalated --> Resolved: Staff resolves
    Escalated --> Closed: Timeout

    Transferred --> Escalated: New staff accepts
    Transferred --> Resolved: Resolved during transfer

    Resolved --> Active: Guest sends new message\n(within reopen window)
    Resolved --> Closed: Reopen window expires

    Closed --> Archived: Retention policy

    Archived --> [*]
```

---

## State Diagram - Task

```mermaid
stateDiagram-v2
    [*] --> Pending: Task created

    Pending --> InProgress: Staff claims
    Pending --> Cancelled: Cancelled

    InProgress --> Completed: Staff completes
    InProgress --> Pending: Staff unclaims
    InProgress --> Blocked: Awaiting dependency
    InProgress --> Cancelled: Cancelled

    Blocked --> InProgress: Dependency resolved
    Blocked --> Cancelled: Cancelled

    Completed --> [*]
    Cancelled --> [*]
```

---

## Deployment Diagram

```mermaid
flowchart TB
    subgraph Hotel["Hotel Infrastructure"]
        subgraph Docker["Docker Container"]
            node["Node.js Runtime"]
            jack["Jack Application"]
            node --> jack
        end

        subgraph Storage["Local Storage"]
            db[(jack.db<br/>SQLite)]
            uploads["uploads/<br/>Files"]
            logs["logs/<br/>Application logs"]
        end

        jack --> db
        jack --> uploads
        jack --> logs
    end

    subgraph Cloud["External Services"]
        whatsapp["WhatsApp<br/>Business API"]
        twilio["Twilio"]
        claude["Claude API"]
        pms["PMS API"]
    end

    jack <-->|"HTTPS"| whatsapp
    jack <-->|"HTTPS"| twilio
    jack <-->|"HTTPS"| claude
    jack <-->|"HTTPS"| pms

    Staff["Staff Browser"] <-->|"HTTPS/WSS"| jack
    Guest["Guest Device"] <-->|"via channels"| whatsapp
    Guest <-->|"via channels"| twilio
```

---

## Data Flow Diagram

```mermaid
flowchart LR
    subgraph Sources["Data Sources"]
        guest_msg["Guest Messages"]
        pms_data["PMS Data"]
        staff_input["Staff Input"]
    end

    subgraph Processing["Processing"]
        gateway["Gateway"]
        ai["AI Engine"]
        routing["Task Router"]
    end

    subgraph Storage["Data Storage"]
        conversations[(Conversations)]
        guests[(Guests)]
        tasks[(Tasks)]
        knowledge[(Knowledge Base)]
    end

    subgraph Outputs["Outputs"]
        responses["AI Responses"]
        notifications["Notifications"]
        analytics["Analytics"]
    end

    guest_msg --> gateway
    pms_data --> gateway
    staff_input --> gateway

    gateway --> ai
    gateway --> routing
    ai --> knowledge

    gateway --> conversations
    gateway --> guests
    routing --> tasks

    ai --> responses
    routing --> notifications
    conversations --> analytics
    tasks --> analytics
```

---

## Entity Relationship Diagram

```mermaid
erDiagram
    GUEST ||--o{ CONVERSATION : has
    GUEST ||--o{ RESERVATION : has
    GUEST {
        string id PK
        string name
        string email
        string phone
        string channel
        string language
        json preferences
    }

    CONVERSATION ||--o{ MESSAGE : contains
    CONVERSATION ||--o| STAFF : assigned_to
    CONVERSATION {
        string id PK
        string guest_id FK
        string status
        string channel
        datetime started_at
        string assigned_to FK
    }

    MESSAGE {
        string id PK
        string conversation_id FK
        string direction
        string content
        datetime created_at
    }

    STAFF ||--o{ TASK : assigned
    STAFF {
        string id PK
        string email
        string name
        string role
        string department
        string status
    }

    TASK ||--o| CONVERSATION : related_to
    TASK {
        string id PK
        string type
        string status
        string priority
        string assigned_to FK
        string conversation_id FK
    }

    RESERVATION ||--o| GUEST : for
    RESERVATION {
        string id PK
        string guest_id FK
        string room_number
        date check_in
        date check_out
        string status
    }
```

---

## Network Diagram

```mermaid
flowchart TB
    subgraph Internet["Internet"]
        guest["Guest Devices"]
        whatsapp["WhatsApp Servers"]
        twilio["Twilio Servers"]
        claude["Claude API"]
    end

    subgraph DMZ["DMZ / Reverse Proxy"]
        nginx["Nginx / Caddy"]
    end

    subgraph Internal["Internal Network"]
        jack["Jack Server<br/>:3000"]
        pms["PMS Server"]
    end

    guest -->|"443"| nginx
    whatsapp -->|"443"| nginx
    twilio -->|"443"| nginx

    nginx -->|"3000"| jack

    jack -->|"443"| whatsapp
    jack -->|"443"| twilio
    jack -->|"443"| claude
    jack -->|"varies"| pms
```

---

## Usage

These diagrams can be rendered using:

1. **GitHub/GitLab** - Native Mermaid support in markdown
2. **VS Code** - Mermaid extension
3. **Mermaid Live Editor** - https://mermaid.live
4. **Documentation tools** - Docusaurus, MkDocs with plugins

---

## Related

- [Architecture Overview](index.md) - Written architecture description
- [C4 Components](c4-components/) - Detailed component specifications
- [Tech Stack](tech-stack.md) - Technology choices
