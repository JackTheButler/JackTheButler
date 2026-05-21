import type { EntryInput } from '../useKnowledge';
import type { Grid } from './parseFile';

/**
 * Header detection + row → Q&A mapping. The first grid row is treated as
 * headers; columns are auto-matched by name and the user can correct the
 * mapping in the dialog. `-1` means "not mapped".
 */

export interface ColumnMap {
  question: number;
  answer: number;
  topic: number;
}

const ALIASES: Record<keyof ColumnMap, string[]> = {
  question: ['question', 'questions', 'q', 'prompt', 'query'],
  answer: ['answer', 'answers', 'a', 'response', 'reply'],
  topic: ['topic', 'category', 'tag', 'group', 'section'],
};

export function detectColumns(headers: string[]): ColumnMap {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const find = (key: keyof ColumnMap) => norm.findIndex((h) => ALIASES[key].includes(h));
  return { question: find('question'), answer: find('answer'), topic: find('topic') };
}

/** Outcome of applying a mapping to the data rows: the valid Q&A pairs plus a
 *  count of rows dropped for missing question/answer (shown in the summary). */
export interface MappedRows {
  pairs: EntryInput[];
  invalid: number;
}

/** Build pairs from data rows (everything after the header) using `map`.
 *  Rows missing a question or answer are counted as invalid and skipped. */
export function mapRows(grid: Grid, map: ColumnMap): MappedRows {
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');
  const pairs: EntryInput[] = [];
  let invalid = 0;

  for (const row of grid.slice(1)) {
    const question = cell(row, map.question);
    const answer = cell(row, map.answer);
    if (!question || !answer) {
      invalid++;
      continue;
    }
    const topic = cell(row, map.topic);
    pairs.push({ question, answer, topic: topic || null });
  }
  return { pairs, invalid };
}
