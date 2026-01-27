# WebChat Widget Specification

This document defines the embeddable web chat widget for Jack The Butler.

---

## Overview

The WebChat widget is a JavaScript component that hotels embed on their website to enable guest conversations. It connects to Jack via WebSocket for real-time messaging.

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Hotel Website                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                                                   │  │
│  │                 Page Content                      │  │
│  │                                                   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  ┌─────────────────────┐                                │
│  │   WebChat Widget    │◄─── Shadow DOM (isolated CSS)  │
│  │  ┌───────────────┐  │                                │
│  │  │ Chat Window   │  │                                │
│  │  │  ┌─────────┐  │  │                                │
│  │  │  │Messages │  │  │◄─── WebSocket connection       │
│  │  │  └─────────┘  │  │                                │
│  │  │  ┌─────────┐  │  │                                │
│  │  │  │ Input   │  │  │                                │
│  │  │  └─────────┘  │  │                                │
│  │  └───────────────┘  │                                │
│  │  [Launcher Button]  │                                │
│  └─────────────────────┘                                │
└─────────────────────────────────────────────────────────┘
```

---

## Widget Installation

### Embed Script

```html
<!-- Add before closing </body> tag -->
<script>
  (function(w, d, s, o, f, js, fjs) {
    w['JackWidget'] = o;
    w[o] = w[o] || function() { (w[o].q = w[o].q || []).push(arguments) };
    js = d.createElement(s); fjs = d.getElementsByTagName(s)[0];
    js.id = o; js.src = f; js.async = 1;
    fjs.parentNode.insertBefore(js, fjs);
  }(window, document, 'script', 'jack', 'https://widget.jackthebutler.com/v1/widget.js'));

  jack('init', {
    propertyId: 'HOTEL_PROPERTY_ID',
    // Optional configuration
    position: 'right',
    primaryColor: '#007bff',
    greeting: 'Hello! How can I help you today?',
  });
</script>
```

### NPM Package (For React/Vue/Angular)

```bash
npm install @jackthebutler/widget
```

```typescript
// React example
import { JackWidget } from '@jackthebutler/widget';

function App() {
  return (
    <div>
      <YourApp />
      <JackWidget
        propertyId="HOTEL_PROPERTY_ID"
        position="right"
        primaryColor="#007bff"
      />
    </div>
  );
}
```

---

## Widget Configuration

### Configuration Options

```typescript
interface WidgetConfig {
  // Required
  propertyId: string;

  // Appearance
  position?: 'left' | 'right';          // Default: 'right'
  primaryColor?: string;                 // Default: '#007bff'
  textColor?: string;                    // Default: '#ffffff'
  fontFamily?: string;                   // Default: 'system-ui'

  // Launcher
  launcherIcon?: 'chat' | 'message' | 'custom';
  launcherText?: string;                 // Text next to icon
  customLauncherIcon?: string;           // SVG or image URL

  // Behavior
  greeting?: string;                     // Initial message
  placeholder?: string;                  // Input placeholder
  autoOpen?: boolean;                    // Open on load
  autoOpenDelay?: number;                // Delay before auto-open (ms)
  hideOnMobile?: boolean;                // Hide on mobile devices
  mobileBreakpoint?: number;             // Default: 768

  // Identification
  guestEmail?: string;                   // Pre-identify guest
  guestName?: string;
  guestPhone?: string;
  reservationId?: string;

  // Localization
  language?: string;                     // Default: auto-detect
  translations?: Record<string, string>;

  // Privacy
  cookieConsent?: boolean;               // Require cookie consent
  privacyPolicyUrl?: string;

  // Advanced
  apiEndpoint?: string;                  // Custom API endpoint
  wsEndpoint?: string;                   // Custom WebSocket endpoint
  debug?: boolean;                       // Enable debug logging
}
```

### Default Configuration

```typescript
const DEFAULT_CONFIG: Partial<WidgetConfig> = {
  position: 'right',
  primaryColor: '#007bff',
  textColor: '#ffffff',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  launcherIcon: 'chat',
  placeholder: 'Type a message...',
  autoOpen: false,
  hideOnMobile: false,
  mobileBreakpoint: 768,
  cookieConsent: false,
  debug: false,
};
```

---

## Component Structure

### Main Components

```typescript
// widget/src/components/Widget.tsx
interface WidgetProps {
  config: WidgetConfig;
}

export function Widget({ config }: WidgetProps) {
  const [isOpen, setIsOpen] = useState(config.autoOpen || false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  return (
    <div className="jack-widget" data-position={config.position}>
      {isOpen ? (
        <ChatWindow
          config={config}
          messages={messages}
          connectionStatus={connectionStatus}
          onClose={() => setIsOpen(false)}
          onSendMessage={handleSendMessage}
        />
      ) : (
        <Launcher
          config={config}
          unreadCount={unreadCount}
          onClick={() => setIsOpen(true)}
        />
      )}
    </div>
  );
}
```

### Chat Window

```typescript
// widget/src/components/ChatWindow.tsx
interface ChatWindowProps {
  config: WidgetConfig;
  messages: Message[];
  connectionStatus: ConnectionStatus;
  onClose: () => void;
  onSendMessage: (content: string) => void;
}

export function ChatWindow({
  config,
  messages,
  connectionStatus,
  onClose,
  onSendMessage,
}: ChatWindowProps) {
  return (
    <div className="jack-chat-window">
      <Header
        title={config.headerTitle || 'Chat with us'}
        onClose={onClose}
        connectionStatus={connectionStatus}
      />

      <MessageList messages={messages} />

      {connectionStatus === 'error' && (
        <ConnectionError onRetry={reconnect} />
      )}

      <MessageInput
        placeholder={config.placeholder}
        onSend={onSendMessage}
        disabled={connectionStatus !== 'connected'}
      />

      {config.poweredBy !== false && (
        <PoweredBy />
      )}
    </div>
  );
}
```

### Message Types

```typescript
interface Message {
  id: string;
  content: string;
  contentType: 'text' | 'image' | 'file' | 'typing';
  direction: 'inbound' | 'outbound';
  sender: 'guest' | 'ai' | 'staff';
  senderName?: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'delivered' | 'error';
}

// Message component
function MessageBubble({ message }: { message: Message }) {
  return (
    <div
      className={`jack-message jack-message--${message.direction}`}
      data-sender={message.sender}
    >
      {message.sender === 'staff' && (
        <Avatar name={message.senderName} />
      )}
      <div className="jack-message__content">
        {message.contentType === 'text' && (
          <TextContent content={message.content} />
        )}
        {message.contentType === 'image' && (
          <ImageContent src={message.content} />
        )}
        {message.contentType === 'typing' && (
          <TypingIndicator />
        )}
      </div>
      <div className="jack-message__meta">
        <time>{formatTime(message.timestamp)}</time>
        {message.direction === 'outbound' && (
          <MessageStatus status={message.status} />
        )}
      </div>
    </div>
  );
}
```

---

## WebSocket Connection

### Connection Manager

```typescript
// widget/src/lib/connection.ts
class WidgetConnection {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(
    private config: WidgetConfig,
    private handlers: ConnectionHandlers
  ) {}

  connect(): void {
    const wsUrl = this.config.wsEndpoint || 'wss://api.jackthebutler.com/ws';
    const params = new URLSearchParams({
      propertyId: this.config.propertyId,
      clientType: 'webchat',
    });

    this.ws = new WebSocket(`${wsUrl}?${params}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.handlers.onConnected();

      // Identify guest if info provided
      if (this.config.guestEmail || this.config.reservationId) {
        this.send({
          type: 'identify',
          data: {
            email: this.config.guestEmail,
            name: this.config.guestName,
            phone: this.config.guestPhone,
            reservationId: this.config.reservationId,
          },
        });
      }
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handlers.onMessage(message);
    };

    this.ws.onclose = (event) => {
      this.handlers.onDisconnected();

      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.handlers.onError(new Error('WebSocket error'));
    };
  }

  send(message: OutboundMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  disconnect(): void {
    this.ws?.close(1000, 'User closed widget');
  }
}
```

---

## Styling

### CSS Variables (Customization)

```css
/* widget/src/styles/variables.css */
:host {
  /* Colors */
  --jack-primary: #007bff;
  --jack-primary-dark: #0056b3;
  --jack-text: #333333;
  --jack-text-light: #666666;
  --jack-background: #ffffff;
  --jack-border: #e0e0e0;

  /* Typography */
  --jack-font-family: system-ui, -apple-system, sans-serif;
  --jack-font-size: 14px;
  --jack-line-height: 1.5;

  /* Spacing */
  --jack-spacing-xs: 4px;
  --jack-spacing-sm: 8px;
  --jack-spacing-md: 16px;
  --jack-spacing-lg: 24px;

  /* Sizing */
  --jack-widget-width: 380px;
  --jack-widget-height: 600px;
  --jack-launcher-size: 60px;

  /* Borders */
  --jack-border-radius: 12px;
  --jack-border-radius-sm: 8px;

  /* Shadows */
  --jack-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  --jack-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.2);

  /* Transitions */
  --jack-transition: 0.2s ease;
}
```

### Component Styles

```css
/* widget/src/styles/components.css */
.jack-widget {
  position: fixed;
  bottom: var(--jack-spacing-lg);
  z-index: 999999;
  font-family: var(--jack-font-family);
  font-size: var(--jack-font-size);
  line-height: var(--jack-line-height);
}

.jack-widget[data-position="right"] {
  right: var(--jack-spacing-lg);
}

.jack-widget[data-position="left"] {
  left: var(--jack-spacing-lg);
}

.jack-chat-window {
  width: var(--jack-widget-width);
  height: var(--jack-widget-height);
  max-height: calc(100vh - 100px);
  background: var(--jack-background);
  border-radius: var(--jack-border-radius);
  box-shadow: var(--jack-shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: jack-slide-up 0.3s ease;
}

.jack-launcher {
  width: var(--jack-launcher-size);
  height: var(--jack-launcher-size);
  border-radius: 50%;
  background: var(--jack-primary);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--jack-shadow);
  transition: transform var(--jack-transition), box-shadow var(--jack-transition);
}

.jack-launcher:hover {
  transform: scale(1.05);
  box-shadow: var(--jack-shadow-lg);
}

@keyframes jack-slide-up {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Mobile responsive */
@media (max-width: 480px) {
  .jack-chat-window {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    border-radius: 0;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
}
```

---

## Offline / Error States

### Connection States

```typescript
type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

function ConnectionIndicator({ status }: { status: ConnectionStatus }) {
  const messages = {
    connecting: 'Connecting...',
    connected: null,  // Don't show when connected
    reconnecting: 'Reconnecting...',
    disconnected: 'Disconnected',
    error: 'Connection error',
  };

  if (!messages[status]) return null;

  return (
    <div className={`jack-connection jack-connection--${status}`}>
      {status === 'connecting' || status === 'reconnecting' ? (
        <Spinner size="small" />
      ) : null}
      <span>{messages[status]}</span>
      {status === 'error' && (
        <button onClick={reconnect}>Retry</button>
      )}
    </div>
  );
}
```

### Offline Queue

```typescript
// Queue messages when offline, send when reconnected
class MessageQueue {
  private queue: QueuedMessage[] = [];

  add(message: OutboundMessage): string {
    const id = generateId();
    this.queue.push({ id, message, status: 'pending' });
    return id;
  }

  async flush(connection: WidgetConnection): Promise<void> {
    for (const item of this.queue) {
      try {
        await connection.send(item.message);
        item.status = 'sent';
      } catch (error) {
        item.status = 'error';
      }
    }

    // Remove sent messages
    this.queue = this.queue.filter(m => m.status !== 'sent');
  }

  getPending(): QueuedMessage[] {
    return this.queue.filter(m => m.status === 'pending');
  }
}
```

---

## Build Configuration

### Rollup Config

```javascript
// widget/rollup.config.js
import typescript from '@rollup/plugin-typescript';
import { terser } from 'rollup-plugin-terser';
import postcss from 'rollup-plugin-postcss';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/widget.js',
      format: 'iife',
      name: 'JackWidget',
      sourcemap: true,
    },
    {
      file: 'dist/widget.min.js',
      format: 'iife',
      name: 'JackWidget',
      plugins: [terser()],
    },
    {
      file: 'dist/widget.esm.js',
      format: 'es',
      sourcemap: true,
    },
  ],
  plugins: [
    nodeResolve(),
    typescript(),
    postcss({
      inject: false,
      extract: 'widget.css',
      minimize: true,
    }),
  ],
};
```

### Package.json

```json
{
  "name": "@jackthebutler/widget",
  "version": "1.0.0",
  "main": "dist/widget.js",
  "module": "dist/widget.esm.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "rollup -c",
    "dev": "rollup -c -w",
    "test": "vitest"
  },
  "peerDependencies": {
    "react": ">=17.0.0",
    "react-dom": ">=17.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true },
    "react-dom": { "optional": true }
  }
}
```

---

## CDN Distribution

### Hosting

```yaml
# CloudFront / CDN configuration
cdn:
  origin: s3://jack-widget-assets
  paths:
    - /v1/widget.js
    - /v1/widget.min.js
    - /v1/widget.css

  caching:
    defaultTTL: 86400          # 24 hours
    maxTTL: 604800             # 7 days

  headers:
    - name: Access-Control-Allow-Origin
      value: "*"
    - name: Cache-Control
      value: "public, max-age=86400"

  # Version pinning supported
  # https://widget.jackthebutler.com/v1/widget.js
  # https://widget.jackthebutler.com/v1.2.3/widget.js
```

### Integrity Hash

```html
<!-- With SRI (Subresource Integrity) -->
<script
  src="https://widget.jackthebutler.com/v1/widget.min.js"
  integrity="sha384-abc123..."
  crossorigin="anonymous"
></script>
```

---

## Configuration Summary

```yaml
widget:
  # Build
  build:
    outputDir: dist
    minify: true
    sourceMaps: true

  # CDN
  cdn:
    url: https://widget.jackthebutler.com
    version: v1

  # Defaults
  defaults:
    position: right
    primaryColor: "#007bff"
    autoOpen: false

  # Feature flags
  features:
    fileUpload: true
    imagePreview: true
    typingIndicator: true
    readReceipts: true
    soundNotifications: true

  # Limits
  limits:
    maxMessageLength: 4000
    maxFileSize: 10485760      # 10 MB
    allowedFileTypes:
      - image/*
      - application/pdf
```

---

## Related

- [WebChat Channel](webchat-channel.md) - Backend integration
- [WebSocket Protocol](../api/gateway-api.md#websocket-api) - Real-time communication
- [Authentication](../api/authentication.md) - Guest identification
