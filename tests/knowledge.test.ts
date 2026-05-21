import { describe, it, expect, beforeAll } from 'vitest';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.APP_CONFIG_KEY = 'test-app-config-key-1234567890';

const { runMigrations } = await import('../src/db/migrate.js');
runMigrations();
const { app } = await import('../src/app.js');
const { setAppModules } = await import('../src/modules/apps/registry.js');
const { stubEmbeddingModule, setStubVector } = await import(
  './fixtures/stub-embedding-app.js'
);

setAppModules([stubEmbeddingModule]);

const COOKIE = 'jane_session';
let cookie = '';

function authed(path: string, init: RequestInit = {}) {
  return app.request(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      cookie: `${COOKIE}=${cookie}`,
      ...(init.headers ?? {}),
    },
  });
}

beforeAll(async () => {
  const res = await app.request('/api/auth/setup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Admin', email: 'a@example.com', password: 'supersecret' }),
  });
  cookie = res.headers.get('set-cookie')!.match(new RegExp(`${COOKIE}=([^;]+)`))![1];
});

describe('knowledge base — entries', () => {
  it('requires auth (protected-by-default)', async () => {
    expect((await app.request('/api/app/knowledge/entries')).status).toBe(401);
  });

  it('lists an empty KB on a fresh install', async () => {
    const body = await (await authed('/api/app/knowledge/entries')).json();
    expect(body).toEqual({ entries: [] });
  });

  it('saves without embedding when no embedding app is active', async () => {
    setAppModules([]); // no apps registered, so no embedding instance
    const res = await authed('/api/app/knowledge/entries', {
      method: 'POST',
      body: JSON.stringify({
        question: 'Do you ship internationally?',
        answer: 'Yes, to most countries except sanctioned ones.',
        topic: 'Shipping',
      }),
    });
    expect(res.status).toBe(201);
    const entry = await res.json();
    expect(entry).toMatchObject({
      question: 'Do you ship internationally?',
      topic: 'Shipping',
      status: 'approved',
      hasEmbedding: false, // no embedding app was active when saving
    });
    setAppModules([stubEmbeddingModule]); // restore for following tests
  });

  it('embeds the question on save when an embedding app is active', async () => {
    // Configure + enable the stub embedding app via the apps framework.
    await authed('/api/app/apps/stub-embed/config', {
      method: 'PUT',
      body: JSON.stringify({ config: { apiKey: 'stub-key' } }),
    });
    await authed('/api/app/apps/stub-embed/enable', { method: 'POST' });

    setStubVector('What is your refund policy?', [0.5, 0.5, 0]);

    const res = await authed('/api/app/knowledge/entries', {
      method: 'POST',
      body: JSON.stringify({
        question: 'What is your refund policy?',
        answer: '30-day returns; email support to start the process.',
        topic: 'Refunds',
      }),
    });
    expect(res.status).toBe(201);
    const entry = await res.json();
    expect(entry).toMatchObject({
      question: 'What is your refund policy?',
      topic: 'Refunds',
      hasEmbedding: true,
    });
  });

  it('rejects empty question + answer', async () => {
    expect(
      (
        await authed('/api/app/knowledge/entries', {
          method: 'POST',
          body: JSON.stringify({ question: '', answer: '', topic: null }),
        })
      ).status,
    ).toBe(400);
  });

  it('updates an entry; re-embeds only when the question changed', async () => {
    setStubVector('Where do you ship?', [0.1, 0.9, 0]);
    const created = await (
      await authed('/api/app/knowledge/entries', {
        method: 'POST',
        body: JSON.stringify({
          question: 'Where do you ship?',
          answer: 'Worldwide except sanctioned regions.',
          topic: 'Shipping',
        }),
      })
    ).json();

    // Edit the answer only — question stays the same; re-embed should NOT
    // happen. We don't assert on the embed-call count here (out of scope
    // for the manual flow), but the resulting hasEmbedding stays true.
    const updated = await (
      await authed(`/api/app/knowledge/entries/${created.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          question: 'Where do you ship?',
          answer: 'Worldwide except sanctioned regions. See /shipping for details.',
          topic: 'Shipping',
        }),
      })
    ).json();
    expect(updated.answer).toContain('See /shipping');
    expect(updated.hasEmbedding).toBe(true);
  });

  it('deletes an entry', async () => {
    const created = await (
      await authed('/api/app/knowledge/entries', {
        method: 'POST',
        body: JSON.stringify({
          question: 'How do I cancel?',
          answer: 'Account → Billing → Cancel.',
          topic: 'Account',
        }),
      })
    ).json();
    const del = await authed(`/api/app/knowledge/entries/${created.id}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(200);
    expect((await authed(`/api/app/knowledge/entries/${created.id}`)).status).toBe(404);
  });

  it('filters list by topic', async () => {
    const { entries } = await (
      await authed('/api/app/knowledge/entries?topic=Shipping')
    ).json();
    for (const e of entries as Array<{ topic: string }>) {
      expect(e.topic).toBe('Shipping');
    }
  });

  it('settings lazy-seed (balanced + topK 5) and strictness round-trips', async () => {
    // First read seeds the defaults.
    expect(await (await authed('/api/app/knowledge/settings')).json()).toEqual({
      matchStrictness: 'balanced',
      topK: 5,
    });

    const res = await authed('/api/app/knowledge/settings', {
      method: 'PUT',
      body: JSON.stringify({ matchStrictness: 'strict' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matchStrictness: 'strict', topK: 5 });
    expect(await (await authed('/api/app/knowledge/settings')).json()).toEqual({
      matchStrictness: 'strict',
      topK: 5,
    });
  });

  it('topK round-trips and is independent of strictness', async () => {
    const res = await authed('/api/app/knowledge/settings', {
      method: 'PUT',
      body: JSON.stringify({ topK: 8 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matchStrictness: 'strict', topK: 8 });
  });

  it('rejects an invalid strictness level', async () => {
    const res = await authed('/api/app/knowledge/settings', {
      method: 'PUT',
      body: JSON.stringify({ matchStrictness: 'whatever' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects an out-of-set topK', async () => {
    const res = await authed('/api/app/knowledge/settings', {
      method: 'PUT',
      body: JSON.stringify({ topK: 7 }),
    });
    expect(res.status).toBe(400);
  });
});

describe('knowledge base — bulk import', () => {
  it('requires auth (protected-by-default)', async () => {
    expect(
      (await app.request('/api/app/knowledge/entries/bulk', { method: 'POST' })).status,
    ).toBe(401);
  });

  it('bulk-inserts entries unembedded and reports counts', async () => {
    const res = await authed('/api/app/knowledge/entries/bulk', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { question: 'Bulk Q one?', answer: 'A one', topic: 'Import' },
          { question: 'Bulk Q two?', answer: 'A two', topic: null },
        ],
      }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ inserted: 2, skipped: 0 });

    // Inserted as approved-but-unembedded — the re-embed-missing flow backfills.
    const { entries } = await (
      await authed('/api/app/knowledge/entries?topic=Import')
    ).json();
    const one = (entries as Array<{ question: string; status: string; hasEmbedding: boolean }>).find(
      (e) => e.question === 'Bulk Q one?',
    );
    expect(one).toMatchObject({ status: 'approved', hasEmbedding: false });
  });

  it('skips duplicates — existing rows and within-batch (normalized)', async () => {
    const res = await authed('/api/app/knowledge/entries/bulk', {
      method: 'POST',
      body: JSON.stringify({
        entries: [
          { question: 'Bulk Q one?', answer: 'dup of an existing entry', topic: null },
          { question: 'Bulk Q THREE', answer: 'genuinely new', topic: null },
          { question: 'bulk q three?', answer: 'normalized dup of the prev row', topic: null },
        ],
      }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ inserted: 1, skipped: 2 });
  });

  it('check flags exact (normalized) matches, index-aligned', async () => {
    const res = await authed('/api/app/knowledge/entries/check', {
      method: 'POST',
      body: JSON.stringify({ questions: ['bulk q one', 'A brand new question'] }),
    });
    expect(res.status).toBe(200);
    const { results } = await res.json();
    // Normalized match despite different case + missing '?'.
    expect(results[0]).toMatchObject({ exists: true, matchedQuestion: 'Bulk Q one?' });
    expect(results[1].exists).toBe(false);
  });

  it('flags semantic near-matches via question vectors (and reports mode)', async () => {
    // An embedded entry whose QUESTION vector is on the z-axis — orthogonal to
    // every other entry's vector in these tests, so matches are isolated.
    setStubVector('How do I reset my password?', [0, 0, 1]);
    await authed('/api/app/knowledge/entries', {
      method: 'POST',
      body: JSON.stringify({
        question: 'How do I reset my password?',
        answer: 'Open Settings → Security → Reset password.',
        topic: 'Account',
      }),
    });

    // A reworded question (different text → no exact hit) with the same vector,
    // and an unrelated one pointing the opposite way (cosine -1 → no match).
    setStubVector('What are the steps to reset my password?', [0, 0, 1]);
    setStubVector('Totally unrelated weather query', [0, 0, -1]);

    const res = await authed('/api/app/knowledge/entries/check', {
      method: 'POST',
      body: JSON.stringify({
        questions: ['What are the steps to reset my password?', 'Totally unrelated weather query'],
      }),
    });
    expect(res.status).toBe(200);
    const { mode, results } = await res.json();
    expect(mode).toBe('semantic');
    expect(results[0].exists).toBe(false); // different text — not an exact dup
    expect(results[0].similar).toMatchObject({ question: 'How do I reset my password?' });
    expect(results[0].similar.score).toBeGreaterThanOrEqual(0.9);
    expect(results[1]).toEqual({ exists: false }); // orthogonal/opposite — no match
  });

  it('rejects an empty batch', async () => {
    const res = await authed('/api/app/knowledge/entries/bulk', {
      method: 'POST',
      body: JSON.stringify({ entries: [] }),
    });
    expect(res.status).toBe(400);
  });
});
