/**
 * Mock data for the Reports dashboard. Deterministic (seeded), so charts look
 * organic but never reshuffle between renders. Swap these builders for real API
 * calls when the analytics backend lands — the shapes are the contract.
 */

/** Tiny seeded PRNG (mulberry32) so mock series are stable across renders. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Range = '7d' | '30d' | '90d';
export const RANGES: Range[] = ['7d', '30d', '90d'];
export const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 };

export const AGENTS = ['All agents', 'Maya Chen', 'Leo Park', 'Sara Adeyemi', 'Tom Becker'] as const;
export type Agent = (typeof AGENTS)[number];

function dayLabels(n: number): string[] {
  const out: string[] = [];
  const now = new Date('2026-05-24T00:00:00');
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  return out;
}

/** Headline KPIs. `delta` is the % change vs. the previous equal period;
 *  `good` marks whether an increase is desirable (for colour). */
export interface Kpi {
  id: string;
  label: string;
  value: string;
  delta: number;
  goodWhenUp: boolean;
  hint: string;
}

export function kpis(range: Range): Kpi[] {
  // Slightly different numbers per range so switching the filter feels live.
  const bump = range === '7d' ? 0 : range === '30d' ? 1 : 2;
  return [
    {
      id: 'deflection',
      label: 'AI deflection',
      value: `${68 - bump}%`,
      delta: 4.2 - bump,
      goodWhenUp: true,
      hint: 'Resolved by Jane with no human handoff',
    },
    {
      id: 'handoff',
      label: 'Handoff rate',
      value: `${32 + bump}%`,
      delta: -(4.2 - bump),
      goodWhenUp: false,
      hint: 'Escalated to a human agent',
    },
    {
      id: 'frt',
      label: 'Median first response',
      value: range === '90d' ? '2m 10s' : '1m 48s',
      delta: -12,
      goodWhenUp: false,
      hint: 'Time to the first human reply',
    },
    {
      id: 'csat',
      label: 'CSAT',
      value: `${(4.6 - bump * 0.1).toFixed(1)} / 5`,
      delta: 2.1,
      goodWhenUp: true,
      hint: 'Average post-chat rating',
    },
    {
      id: 'resolution',
      label: 'Median resolution',
      value: range === '7d' ? '14m' : '16m',
      delta: -8,
      goodWhenUp: false,
      hint: 'Open to close, human conversations',
    },
    {
      id: 'sla',
      label: 'SLA compliance',
      value: `${94 - bump}%`,
      delta: 1.4,
      goodWhenUp: true,
      hint: 'Handled within target time',
    },
  ];
}

export interface VolumePoint {
  date: string;
  ai: number;
  human: number;
}

/** Daily conversation volume, split into AI-resolved vs. human-handled. */
export function volume(range: Range): VolumePoint[] {
  const days = RANGE_DAYS[range];
  // Cap the x-axis density: weekly buckets beyond 30 days keep it readable.
  const step = days > 30 ? 7 : 1;
  const labels = dayLabels(days);
  const r = rng(days);
  const out: VolumePoint[] = [];
  for (let i = 0; i < days; i += step) {
    const base = 90 + Math.sin(i / 3) * 22 + r() * 30;
    const total = Math.round(base * step * (step > 1 ? 0.4 : 1));
    const ai = Math.round(total * (0.62 + r() * 0.12));
    out.push({ date: labels[i], ai, human: total - ai });
  }
  return out;
}

export interface RatePoint {
  date: string;
  rate: number;
}

/** AI deflection rate trend (%). */
export function deflectionTrend(range: Range): RatePoint[] {
  const days = RANGE_DAYS[range];
  const step = days > 30 ? 7 : days > 7 ? 3 : 1;
  const labels = dayLabels(days);
  const r = rng(days * 7);
  const out: RatePoint[] = [];
  for (let i = 0; i < days; i += step) {
    out.push({ date: labels[i], rate: Math.round(60 + Math.sin(i / 4) * 6 + r() * 8) });
  }
  return out;
}

export interface CsatPoint {
  date: string;
  ai: number;
  human: number;
}

/** CSAT trend, AI vs. human, on a 1–5 scale. */
export function csatTrend(range: Range): CsatPoint[] {
  const days = RANGE_DAYS[range];
  const step = days > 30 ? 7 : days > 7 ? 3 : 1;
  const labels = dayLabels(days);
  const r = rng(days * 13);
  const out: CsatPoint[] = [];
  for (let i = 0; i < days; i += step) {
    out.push({
      date: labels[i],
      ai: +(4.2 + Math.sin(i / 5) * 0.2 + r() * 0.2).toFixed(2),
      human: +(4.6 + Math.cos(i / 5) * 0.15 + r() * 0.15).toFixed(2),
    });
  }
  return out;
}

export interface NamedCount {
  name: string;
  count: number;
}

/** Why conversations got escalated to a human. */
export const handoffReasons: NamedCount[] = [
  { name: 'Low AI confidence', count: 142 },
  { name: 'Asked for a human', count: 98 },
  { name: 'Billing / refund', count: 76 },
  { name: 'Bug report', count: 54 },
  { name: 'Angry sentiment', count: 39 },
  { name: 'Account access', count: 27 },
];

/** Most common conversation topics (from tagging). */
export const topTopics: NamedCount[] = [
  { name: 'Order status', count: 312 },
  { name: 'Returns', count: 248 },
  { name: 'Login issues', count: 187 },
  { name: 'Pricing', count: 156 },
  { name: 'Shipping', count: 134 },
  { name: 'Product specs', count: 98 },
];

export interface AgentLoad {
  agent: string;
  open: number;
  resolved: number;
}

/** Live workload + today's throughput per agent. */
export const workload: AgentLoad[] = [
  { agent: 'Maya Chen', open: 7, resolved: 23 },
  { agent: 'Leo Park', open: 5, resolved: 19 },
  { agent: 'Sara Adeyemi', open: 9, resolved: 16 },
  { agent: 'Tom Becker', open: 2, resolved: 11 },
];

export interface ChannelSlice {
  name: string;
  value: number;
}

/** Conversation volume by source channel (for the donut). */
export const channels: ChannelSlice[] = [
  { name: 'Web chat', value: 1820 },
  { name: 'Email', value: 640 },
  { name: 'WhatsApp', value: 410 },
  { name: 'Telegram', value: 190 },
];

export interface KnowledgeGap {
  question: string;
  asked: number;
  confidence: number; // 0–1, the best retrieval score Jane managed
}

/** Questions Jane handled poorly — the "articles to write" backlog. */
export const knowledgeGaps: KnowledgeGap[] = [
  { question: 'How do I change my billing currency?', asked: 41, confidence: 0.21 },
  { question: 'Do you ship to PO boxes?', asked: 33, confidence: 0.28 },
  { question: 'Can I split payment across two cards?', asked: 29, confidence: 0.18 },
  { question: 'What is the warranty on refurbished units?', asked: 24, confidence: 0.34 },
  { question: 'How do I export my data?', asked: 19, confidence: 0.31 },
];

/** Live queue snapshot tiles. */
export const queue = {
  unassigned: 8,
  awaitingReply: 15,
  oldestWaitMin: 42,
  onlineAgents: 4,
};

/**
 * Volume heatmap: rows = weekday (Mon–Sun), cols = hour (0–23), value = relative
 * intensity 0–1. Peaks late morning and mid-afternoon on weekdays.
 */
export function heatmap(seed = 99): number[][] {
  const r = rng(seed);
  const rows: number[][] = [];
  for (let d = 0; d < 7; d += 1) {
    const row: number[] = [];
    const weekend = d >= 5;
    for (let h = 0; h < 24; h += 1) {
      // Two business-hour humps (≈10:00 and ≈15:00), damped on weekends/nights.
      const work = Math.exp(-((h - 10) ** 2) / 12) + Math.exp(-((h - 15) ** 2) / 14);
      const v = work * (weekend ? 0.4 : 1) * (0.7 + r() * 0.5);
      row.push(Math.min(1, v));
    }
    rows.push(row);
  }
  return rows;
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* ── Agent-scoped (operational) data ───────────────────────────────────
 * Surfaced when a specific agent is selected. Seeded by the agent's name so
 * each teammate gets stable-but-distinct numbers. */

function strSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Live snapshot for one agent (the top strip in agent mode). */
export function agentQueue(agent: Agent) {
  const r = rng(strSeed(agent));
  const open = 3 + Math.round(r() * 6);
  return {
    open,
    awaitingReply: Math.max(1, open - Math.round(r() * 3)),
    oldestWaitMin: 8 + Math.round(r() * 40),
    resolvedToday: 10 + Math.round(r() * 14),
  };
}

/** Personal KPI tiles. Reuses the Kpi shape; `hint` carries the team-average
 *  comparison so an agent sees how they stack up. */
export function agentKpis(agent: Agent): Kpi[] {
  const r = rng(strSeed(agent) ^ 0x9e3779b9);
  const q = agentQueue(agent);
  const frtSec = 75 + Math.round(r() * 50); // 1m15s–2m05s
  const csat = +(4.4 + r() * 0.5).toFixed(1);
  const reopened = 2 + Math.round(r() * 5);
  const fmt = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return [
    {
      id: 'my-open',
      label: 'My open',
      value: String(q.open),
      delta: Math.round((r() - 0.5) * 20),
      goodWhenUp: false,
      hint: `Oldest ${q.oldestWaitMin}m ago`,
    },
    {
      id: 'pending-me',
      label: 'Pending on me',
      value: String(Math.max(1, q.open - 2)),
      delta: Math.round((r() - 0.5) * 20),
      goodWhenUp: false,
      hint: `${2 + Math.round(r() * 3)} pending on customer`,
    },
    {
      id: 'resolved-today',
      label: 'Resolved today',
      value: String(q.resolvedToday),
      delta: Math.round(r() * 18),
      goodWhenUp: true,
      hint: 'Team avg 17',
    },
    {
      id: 'my-frt',
      label: 'My first response',
      value: fmt(frtSec),
      delta: -Math.round(r() * 18),
      goodWhenUp: false,
      hint: 'Team 1m 48s',
    },
    {
      id: 'my-csat',
      label: 'My CSAT',
      value: `${csat.toFixed(1)} / 5`,
      delta: +(r() * 4).toFixed(1),
      goodWhenUp: true,
      hint: 'Team 4.6',
    },
    {
      id: 'reopened',
      label: 'Reopened',
      value: `${reopened}%`,
      delta: Math.round((r() - 0.6) * 12),
      goodWhenUp: false,
      hint: 'Team 5%',
    },
  ];
}

export type SlaState = 'ok' | 'at-risk' | 'breached';

export interface MyConversation {
  id: string;
  customer: string;
  snippet: string;
  channel: string;
  waitingMin: number;
  sla: SlaState;
}

const CUSTOMERS = [
  'Aisha Rahman',
  'Daniel Brooks',
  'Priya Nair',
  'Marcus Webb',
  'Elena Sokolova',
  'Kenji Watanabe',
  'Nora Lindgren',
  'Hugo Martín',
];
const SNIPPETS = [
  'I still haven’t received my refund…',
  'Can you check the status of order #4821?',
  'The discount code isn’t applying at checkout.',
  'How do I change the email on my account?',
  'Package says delivered but I never got it.',
  'Need to update my billing address.',
  'Is the warranty transferable?',
  'App keeps logging me out.',
];
const CHANNELS = ['Web chat', 'Email', 'WhatsApp', 'Telegram'];

function slaFor(min: number): SlaState {
  if (min >= 30) return 'breached';
  if (min >= 15) return 'at-risk';
  return 'ok';
}

/** This agent's open conversations, oldest-first, with SLA state flagged. */
export function myOpenConversations(agent: Agent): MyConversation[] {
  const r = rng(strSeed(agent) ^ 0x5bd1e995);
  const n = agentQueue(agent).open;
  const out: MyConversation[] = [];
  for (let i = 0; i < n; i += 1) {
    const waitingMin = 1 + Math.round(r() * 44);
    out.push({
      id: `c${i}`,
      customer: CUSTOMERS[Math.floor(r() * CUSTOMERS.length)],
      snippet: SNIPPETS[Math.floor(r() * SNIPPETS.length)],
      channel: CHANNELS[Math.floor(r() * CHANNELS.length)],
      waitingMin,
      sla: slaFor(waitingMin),
    });
  }
  return out.sort((a, b) => b.waitingMin - a.waitingMin);
}

export interface AgentCsatPoint {
  date: string;
  mine: number;
  team: number;
}

/** This agent's CSAT vs. the team average over the selected range. */
export function agentCsatTrend(agent: Agent, range: Range): AgentCsatPoint[] {
  const days = RANGE_DAYS[range];
  const step = days > 30 ? 7 : days > 7 ? 3 : 1;
  const labels = dayLabels(days);
  const r = rng(strSeed(agent) ^ (days * 31));
  const out: AgentCsatPoint[] = [];
  for (let i = 0; i < days; i += step) {
    out.push({
      date: labels[i],
      mine: +(4.4 + Math.sin(i / 5) * 0.25 + r() * 0.25).toFixed(2),
      team: +(4.6 + Math.cos(i / 6) * 0.12).toFixed(2),
    });
  }
  return out;
}

export interface AgentVolumePoint {
  date: string;
  you: number;
  team: number;
}

/** This agent's daily handled volume vs. the rest of the team combined. */
export function agentVolume(agent: Agent, range: Range): AgentVolumePoint[] {
  const days = RANGE_DAYS[range];
  const step = days > 30 ? 7 : 1;
  const labels = dayLabels(days);
  const r = rng(strSeed(agent) ^ 0xa5a5);
  const out: AgentVolumePoint[] = [];
  for (let i = 0; i < days; i += step) {
    const you = Math.round((14 + Math.sin(i / 3) * 5 + r() * 8) * (step > 1 ? 4 : 1));
    out.push({ date: labels[i], you, team: Math.round(you * (2.4 + r())) });
  }
  return out;
}

/** This agent's resolution rate (% of their chats they closed without escalating). */
export function agentResolutionTrend(agent: Agent, range: Range): RatePoint[] {
  const days = RANGE_DAYS[range];
  const step = days > 30 ? 7 : days > 7 ? 3 : 1;
  const labels = dayLabels(days);
  const r = rng(strSeed(agent) ^ 0x1234);
  const out: RatePoint[] = [];
  for (let i = 0; i < days; i += step) {
    out.push({ date: labels[i], rate: Math.round(74 + Math.sin(i / 4) * 6 + r() * 8) });
  }
  return out;
}

function scaleCounts(base: NamedCount[], factor: number, r: () => number): NamedCount[] {
  return base
    .map((d) => ({
      name: d.name,
      count: Math.max(1, Math.round(d.count * factor * (0.6 + r() * 0.8))),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Why this agent's chats reached them (their slice of the team's handoffs). */
export function agentHandoffReasons(agent: Agent): NamedCount[] {
  return scaleCounts(handoffReasons, 0.22, rng(strSeed(agent) ^ 0x2222));
}

/** This agent's most common conversation topics. */
export function agentTopTopics(agent: Agent): NamedCount[] {
  return scaleCounts(topTopics, 0.25, rng(strSeed(agent) ^ 0x3333));
}

export interface AgentDayLoad {
  date: string;
  resolved: number;
}

/** This agent's conversations handled per day across the range. */
export function agentWorkloadDaily(agent: Agent, range: Range): AgentDayLoad[] {
  const days = RANGE_DAYS[range];
  const step = days > 30 ? 7 : 1;
  const labels = dayLabels(days);
  const r = rng(strSeed(agent) ^ 0x4444);
  const out: AgentDayLoad[] = [];
  for (let i = 0; i < days; i += step) {
    out.push({
      date: labels[i],
      resolved: Math.round((10 + Math.sin(i / 3) * 4 + r() * 6) * (step > 1 ? 4 : 1)),
    });
  }
  return out;
}

/** This agent's conversation volume by source channel. */
export function agentChannels(agent: Agent): ChannelSlice[] {
  const r = rng(strSeed(agent) ^ 0x5555);
  return channels.map((c) => ({
    name: c.name,
    value: Math.max(10, Math.round(c.value * 0.2 * (0.5 + r()))),
  }));
}

/** This agent's activity heatmap — when they handle conversations. */
export function agentHeatmap(agent: Agent): number[][] {
  return heatmap(strSeed(agent));
}
