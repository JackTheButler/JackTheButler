import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');
const { db } = await import('../src/db/client.js');
const schema = await import('../src/db/schema/index.js');
const svc = await import('../src/modules/conversations/service.js');
const proj = await import('../src/modules/analytics/projection.js');
const analytics = await import('../src/modules/analytics/service.js');
const { eq } = await import('drizzle-orm');

const DAY = 24 * 60 * 60 * 1000;
/** A `now` far enough ahead that today's closes are past the 24h reopen window. */
const afterWindow = () => new Date(Date.now() + DAY + 60 * 60 * 1000);

let agentId = '';

beforeAll(async () => {
  await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'a@example.com', password: 'supersecret' }),
  });
  agentId = db.select().from(schema.staff).get()!.id;
});

const convo = (id: string) =>
  db.select().from(schema.conversations).where(eq(schema.conversations.id, id)).get();
const episodesOf = (id: string) =>
  db.select().from(schema.episodes).where(eq(schema.episodes.conversationId, id)).all();
const eventsOf = (id: string) =>
  db
    .select()
    .from(schema.conversationEvents)
    .where(eq(schema.conversationEvents.conversationId, id))
    .all();

describe('inactivity auto-close', () => {
  it('closes idle conversations with a system (agentless) close event', () => {
    const { conversationId } = svc.ingestInboundMessage({
      channel: 'webchat',
      externalId: 'idle-1',
      content: 'hi',
    });

    const closed = svc.autoCloseIdleConversations(afterWindow());

    expect(closed).toBeGreaterThanOrEqual(1);
    expect(convo(conversationId)!.status).toBe('closed');
    const close = eventsOf(conversationId).find((e) => e.type === 'closed');
    expect(close).toBeTruthy();
    expect(close!.actorAgentId).toBeNull(); // inactivity, not an agent
  });

  it('leaves fresh conversations open', () => {
    const { conversationId } = svc.ingestInboundMessage({
      channel: 'webchat',
      externalId: 'fresh-1',
      content: 'hi',
    });
    svc.autoCloseIdleConversations(new Date()); // cutoff is in the past
    expect(convo(conversationId)!.status).toBe('open');
  });
});

describe('episode projection', () => {
  it('does not materialize until the reopen window has passed', () => {
    const { conversationId } = svc.ingestInboundMessage({
      channel: 'webchat',
      externalId: 'defl-1',
      content: 'hi',
    });
    svc.closeConversation(conversationId, agentId);

    proj.refreshEpisodes(new Date()); // window not elapsed
    expect(episodesOf(conversationId)).toHaveLength(0);

    proj.refreshEpisodes(afterWindow());
    const eps = episodesOf(conversationId);
    expect(eps).toHaveLength(1);
    expect(eps[0].aiDeflected).toBe(true); // no takeover, no escalation
    expect(eps[0].handedOff).toBe(false);
    expect(eps[0].openedVia).toBe('new');
    expect(eps[0].closedByAgentId).toBe(agentId);
    expect(eps[0].firstResponseAt).toBeNull();
  });

  it('a human-handled episode is handed off with a first response', async () => {
    const { conversationId } = svc.ingestInboundMessage({
      channel: 'webchat',
      externalId: 'hand-1',
      content: 'help',
    });
    svc.takeover(conversationId, agentId);
    await svc.reply(conversationId, agentId, 'on it', false);
    svc.closeConversation(conversationId, agentId);

    proj.refreshEpisodes(afterWindow());
    const eps = episodesOf(conversationId);
    expect(eps).toHaveLength(1);
    expect(eps[0].handedOff).toBe(true);
    expect(eps[0].aiDeflected).toBe(false);
    expect(eps[0].firstResponseAt).not.toBeNull();
    expect(eps[0].firstResponseAgentId).toBe(agentId);
  });

  it('a reopen within the window stays the same episode (one row)', () => {
    const { conversationId } = svc.ingestInboundMessage({
      channel: 'webchat',
      externalId: 'reopen-1',
      content: 'q1',
    });
    svc.closeConversation(conversationId, agentId);
    // Customer returns within the window → resumes the same episode.
    svc.ingestInboundMessage({ channel: 'webchat', externalId: 'reopen-1', content: 'still here' });
    svc.closeConversation(conversationId, agentId);

    proj.refreshEpisodes(afterWindow());
    expect(episodesOf(conversationId)).toHaveLength(1);
  });

  it('backfills a legacy conversation missing an episode id, then projects it', () => {
    db.insert(schema.conversations)
      .values({
        id: 'legacy-1',
        ref: 99999,
        channel: 'webchat',
        channelExternalId: 'legacy-x',
        mode: 'ai',
        status: 'closed',
        createdAt: new Date(Date.now() - 5 * DAY),
        lastMessageAt: new Date(Date.now() - 5 * DAY),
      })
      .run();

    expect(proj.backfillEpisodeIds()).toBeGreaterThanOrEqual(1);
    expect(convo('legacy-1')!.currentEpisodeId).not.toBeNull();

    proj.refreshEpisodes(new Date()); // closed 5d ago → already past the window
    expect(episodesOf('legacy-1')).toHaveLength(1);
  });
});

describe('KPI metrics', () => {
  const admin = { id: '', role: 'admin' as const };
  // A 7-day window ending a beat ahead — timestamps are second-resolution, so
  // episodes closed in the same clock second as "now" need an inclusive upper.
  const to = new Date(Date.now() + 60_000);
  const from = new Date(Date.now() - 7 * DAY);
  beforeAll(() => {
    admin.id = agentId;
  });

  it('aggregates team metrics from the materialized episodes', () => {
    const team = analytics.getKpis(admin, from, to);
    expect(team.scope).toBe('team');
    expect(team.current.episodes).toBeGreaterThan(0);
    expect(team.current.aiDeflectionRate).toBeGreaterThanOrEqual(0);
    expect(team.current.aiDeflectionRate).toBeLessThanOrEqual(1);
    expect(team.current.medianResolutionSec).not.toBeNull();
  });

  it('agent scope counts only episodes that agent closed', () => {
    const team = analytics.getKpis(admin, from, to);
    const mine = analytics.getKpis(admin, from, to, agentId);
    expect(mine.scope).toBe('agent');
    // Auto-closed/legacy episodes have a null closer, so the agent set is smaller.
    expect(mine.current.episodes).toBeLessThan(team.current.episodes);
  });

  it('trends bucket episodes and sum to the period total', () => {
    const trends = analytics.getTrends(admin, from, to);
    expect(trends.points.length).toBeGreaterThan(0);
    const bucketTotal = trends.points.reduce((s, p) => s + p.aiResolved + p.human, 0);
    expect(bucketTotal).toBe(analytics.getKpis(admin, from, to).current.episodes);
  });

  it('breakdowns attribute workload, channels, and a 7x24 heatmap', () => {
    const b = analytics.getBreakdowns(admin, from, to);
    // Episodes closed by our agent show up under their workload.
    expect(b.workload.some((w) => w.agentId === agentId && w.resolved > 0)).toBe(true);
    // All test conversations are webchat.
    expect(b.channels.find((c) => c.channel === 'webchat')?.count).toBeGreaterThan(0);
    // Heatmap shape is always weekday x hour.
    expect(b.heatmap).toHaveLength(7);
    expect(b.heatmap.every((row) => row.length === 24)).toBe(true);
  });
});

describe('active agents (presence)', () => {
  const admin = { id: '', role: 'admin' as const };
  const setSeen = (at: Date | null) =>
    db.update(schema.staff).set({ lastSeenAt: at }).where(eq(schema.staff.id, agentId)).run();
  beforeAll(() => {
    admin.id = agentId;
  });

  it('excludes staff with no heartbeat yet', () => {
    setSeen(null);
    expect(analytics.getLiveStats(admin).activeAgents).toBe(0);
  });

  it('counts staff seen within the window (team scope)', () => {
    setSeen(new Date());
    const live = analytics.getLiveStats(admin);
    expect(live.scope).toBe('team');
    expect(live.activeAgents).toBe(1);
  });

  it('drops staff whose heartbeat is older than the window', () => {
    setSeen(new Date(Date.now() - 10 * 60_000)); // window is 5 min
    expect(analytics.getLiveStats(admin).activeAgents).toBe(0);
  });

  it('is null in agent scope', () => {
    setSeen(new Date());
    const mine = analytics.getLiveStats(admin, agentId);
    expect(mine.scope).toBe('agent');
    expect(mine.activeAgents).toBeNull();
  });
});
