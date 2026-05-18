// Static fixtures for the Phase 1 mock UI. No backend.

export type Channel = 'webchat' | 'telegram' | 'whatsapp';
export type Mode = 'ai' | 'human';
export type Status = 'needs_reply' | 'resolved';
export type Author = 'customer' | 'ai' | 'staff';

export interface Message {
  id: string;
  author: Author;
  content: string;
  time: string;
}

export interface Conversation {
  id: string;
  ref: string;
  customer: string;
  channel: Channel;
  mode: Mode;
  status: Status;
  snippet: string;
  time: string;
  unread: boolean;
  email: string;
  messages: Message[];
  kbHits: { title: string; score: number }[];
}

export const conversations: Conversation[] = [
  {
    id: 'c1',
    ref: '#1428',
    customer: 'Acme Co.',
    channel: 'whatsapp',
    mode: 'ai',
    status: 'needs_reply',
    snippet: "Hi, my order hasn't arrived yet…",
    time: '2m',
    unread: true,
    email: 'ops@acme.co',
    messages: [
      { id: 'm1', author: 'customer', content: "Hi, my order hasn't arrived yet — it's been 6 days.", time: '09:41' },
      { id: 'm2', author: 'ai', content: 'Sorry to hear that! Could you share your order number so I can check the status?', time: '09:41' },
      { id: 'm3', author: 'customer', content: 'It is ACM-90321.', time: '09:42' },
      { id: 'm4', author: 'ai', content: 'Thanks! Order ACM-90321 shipped on the 12th and is in transit, estimated delivery tomorrow. Want me to share the tracking link?', time: '09:42' },
    ],
    kbHits: [
      { title: 'Shipping & delivery times', score: 0.91 },
      { title: 'Tracking a delayed order', score: 0.84 },
    ],
  },
  {
    id: 'c2',
    ref: '#1427',
    customer: 'Bob Mertens',
    channel: 'telegram',
    mode: 'human',
    status: 'needs_reply',
    snippet: 'Thanks, that worked!',
    time: '1h',
    unread: false,
    email: 'bob.m@gmail.com',
    messages: [
      { id: 'm1', author: 'customer', content: 'The reset link keeps expiring before I can use it.', time: '08:30' },
      { id: 'm2', author: 'staff', content: "I've triggered a fresh link with a longer window — check your inbox.", time: '08:35' },
      { id: 'm3', author: 'customer', content: 'Thanks, that worked!', time: '08:38' },
    ],
    kbHits: [{ title: 'Password reset troubleshooting', score: 0.88 }],
  },
  {
    id: 'c3',
    ref: '#1426',
    customer: 'Lia Park',
    channel: 'webchat',
    mode: 'ai',
    status: 'needs_reply',
    snippet: 'Do you offer annual billing?',
    time: '3h',
    unread: false,
    email: 'lia@parkstudio.io',
    messages: [
      { id: 'm1', author: 'customer', content: 'Do you offer annual billing, and is there a discount?', time: '06:10' },
      { id: 'm2', author: 'ai', content: 'Yes — annual billing saves 20% versus monthly. I can send the upgrade link if useful.', time: '06:10' },
    ],
    kbHits: [{ title: 'Pricing & billing cycles', score: 0.93 }],
  },
  {
    id: 'c4',
    ref: '#1419',
    customer: 'Sam Okafor',
    channel: 'webchat',
    mode: 'ai',
    status: 'resolved',
    snippet: 'How do I export my data?',
    time: 'Yesterday',
    unread: false,
    email: 'sam@okafor.dev',
    messages: [
      { id: 'm1', author: 'customer', content: 'How do I export all my data as CSV?', time: 'Yes 17:02' },
      { id: 'm2', author: 'ai', content: 'Settings → Data → Export creates a CSV of everything; you also get an email when it is ready.', time: 'Yes 17:02' },
    ],
    kbHits: [{ title: 'Exporting your data', score: 0.9 }],
  },
];
