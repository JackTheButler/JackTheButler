import { describe, it, expect } from 'vitest';

// The import helpers are pure (columns.ts has only type-only imports;
// parseCsv is pure string logic), so they run in the node test env without
// the dashboard's DOM/alias setup.
const IMPORT = '../apps/dashboard/src/features/knowledge/import';
const { parseCsv } = await import(`${IMPORT}/parseFile.ts`);
const { detectColumns, mapRows } = await import(`${IMPORT}/columns.ts`);

describe('parseCsv', () => {
  it('splits simple rows and columns', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas + newlines inside quoted fields', () => {
    expect(parseCsv('q,"a, with comma"\n"line1\nline2",x')).toEqual([
      ['q', 'a, with comma'],
      ['line1\nline2', 'x'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"she said ""hi""",end')).toEqual([['she said "hi"', 'end']]);
  });

  it('handles CRLF line endings and a trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('detectColumns', () => {
  it('matches headers by name, case-insensitively', () => {
    expect(detectColumns(['Question', 'ANSWER', 'Topic'])).toEqual({
      question: 0,
      answer: 1,
      topic: 2,
    });
  });

  it('recognises aliases and arbitrary column order', () => {
    expect(detectColumns(['Category', 'Reply', 'Prompt'])).toEqual({
      topic: 0,
      answer: 1,
      question: 2,
    });
  });

  it('returns -1 for columns it cannot find', () => {
    expect(detectColumns(['col1', 'col2'])).toEqual({
      question: -1,
      answer: -1,
      topic: -1,
    });
  });
});

describe('mapRows', () => {
  const grid = [
    ['Question', 'Answer', 'Topic'],
    ['How do I refund?', 'Within 7 days.', 'Refunds'],
    ['', 'orphan answer', 'X'], // missing question → invalid
    ['lonely question', '', 'Y'], // missing answer → invalid
    ['Where do you ship?', 'Worldwide.', ''], // empty topic → null
  ];

  it('builds valid pairs and counts invalid rows', () => {
    const { pairs, invalid } = mapRows(grid, { question: 0, answer: 1, topic: 2 });
    expect(invalid).toBe(2);
    expect(pairs).toEqual([
      { question: 'How do I refund?', answer: 'Within 7 days.', topic: 'Refunds' },
      { question: 'Where do you ship?', answer: 'Worldwide.', topic: null },
    ]);
  });

  it('treats an unmapped topic column (-1) as no topic', () => {
    const { pairs } = mapRows(grid, { question: 0, answer: 1, topic: -1 });
    expect(pairs.every((p: { topic: string | null }) => p.topic === null)).toBe(true);
  });
});
