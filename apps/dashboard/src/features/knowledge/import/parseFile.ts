/**
 * Client-side spreadsheet parsing → a uniform grid of string cells. `.xlsx`
 * uses `read-excel-file`, lazy-imported so it never enters the main bundle;
 * `.csv` uses a small built-in parser (no dependency). The rest of the import
 * flow is format-agnostic from here on.
 */

export type Grid = string[][];

export class UnsupportedFileError extends Error {}

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped `""`,
 *  and commas / newlines inside quotes. Adequate for exported Q&A sheets.
 *  Exported for unit testing; callers use `parseSpreadsheet`. */
export function parseCsv(text: string): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse a spreadsheet into rows of string cells. Drops fully-empty rows. */
export async function parseSpreadsheet(file: File): Promise<Grid> {
  const name = file.name.toLowerCase();
  let grid: Grid;

  if (name.endsWith('.csv')) {
    grid = parseCsv(await file.text());
  } else if (name.endsWith('.xlsx')) {
    // Lazy — the parser only loads once someone actually imports. v9 ships
    // subpath exports only; `/browser` is the in-page (non-worker) build.
    // `readSheet` returns the first sheet's rows directly (the default export
    // returns an array of sheets).
    const { readSheet } = await import('read-excel-file/browser');
    const rows = await readSheet(file);
    grid = rows.map((r) => r.map((cell) => (cell == null ? '' : String(cell))));
  } else {
    throw new UnsupportedFileError('Please choose an .xlsx or .csv file.');
  }

  return grid.filter((r) => r.some((c) => c.trim() !== ''));
}
