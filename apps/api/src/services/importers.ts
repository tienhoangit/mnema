export type CsvImportFormat = 'auto' | 'readwise' | 'apple_books' | 'kobo' | 'goodreads';

export interface ParsedImportRecord {
  sourceTitle: string;
  sourceAuthor: string | null;
  sourceType: 'book' | 'article';
  readingStatus: string;
  sourceNotes: string | null;
  highlightContent: string | null;
  highlightNote: string | null;
  color: 'yellow' | 'blue' | 'green' | 'pink';
  location: string | null;
  tags: string[];
  highlightedAt: string | null;
}

export interface CsvParseOutput {
  detectedFormat: Exclude<CsvImportFormat, 'auto'>;
  records: ParsedImportRecord[];
}

export function parseCsvRows(csvText: string): string[][] {
  const clean = csvText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

function normalizeColor(raw: string | undefined): 'yellow' | 'blue' | 'green' | 'pink' {
  const val = (raw || '').toLowerCase().trim();
  if (val.includes('blue') || val.includes('cyan') || val.includes('sky')) return 'blue';
  if (val.includes('green') || val.includes('emerald')) return 'green';
  if (val.includes('pink') || val.includes('red') || val.includes('purple') || val.includes('magenta')) {
    return 'pink';
  }
  return 'yellow';
}

function parseTagsList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|]/)
    .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
    .filter(Boolean);
}

function mapGoodreadsShelf(shelf: string | undefined): string {
  const val = (shelf || '').toLowerCase().trim();
  if (val === 'read') return 'read';
  if (val === 'currently-reading') return 'reading';
  if (val === 'to-read') return 'want_to_read';
  return 'archive';
}

export function detectCsvFormat(headers: string[]): Exclude<CsvImportFormat, 'auto'> {
  const lower = headers.map((h) => h.toLowerCase().trim());

  if (lower.includes('exclusive shelf') || lower.includes('my review') || lower.includes('bookshelves')) {
    return 'goodreads';
  }
  if (lower.includes('book title') && lower.includes('highlight') && lower.includes('location type')) {
    return 'readwise';
  }
  if (lower.includes('highlight') && (lower.includes('book title') || lower.includes('document tags'))) {
    return 'readwise';
  }
  if (lower.some((h) => h.includes('kobo') || h === 'annotation' || h === 'bookmark')) {
    return 'kobo';
  }
  if (lower.some((h) => h.includes('apple') || h === 'selected text' || h === 'chapter')) {
    return 'apple_books';
  }
  return 'readwise';
}

function getColumnValue(
  row: string[],
  headerMap: Map<string, number>,
  candidates: string[]
): string {
  for (const name of candidates) {
    const idx = headerMap.get(name.toLowerCase());
    if (idx !== undefined && row[idx] !== undefined) {
      return row[idx].trim();
    }
  }
  return '';
}

export function parseImportCsv(
  csvText: string,
  requestedFormat: CsvImportFormat = 'auto'
): CsvParseOutput {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    throw new Error('CSV must contain a header row and at least one data row');
  }

  const headers = rows[0].map((h) => h.trim());
  const headerMap = new Map<string, number>();
  headers.forEach((h, idx) => {
    headerMap.set(h.toLowerCase(), idx);
  });

  const detectedFormat =
    requestedFormat === 'auto' ? detectCsvFormat(headers) : requestedFormat;

  const records: ParsedImportRecord[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    if (detectedFormat === 'goodreads') {
      const title = getColumnValue(row, headerMap, ['Title', 'Book Title']);
      if (!title) continue;

      const author =
        getColumnValue(row, headerMap, ['Author', 'Author l-f', 'Book Author']) || null;
      const shelf = getColumnValue(row, headerMap, ['Exclusive Shelf']);
      const rating = getColumnValue(row, headerMap, ['My Rating']);
      const review = getColumnValue(row, headerMap, ['My Review']);
      const bookshelves = getColumnValue(row, headerMap, ['Bookshelves']);

      const notesParts: string[] = [];
      if (rating && rating !== '0') notesParts.push(`Goodreads Rating: ${rating}/5`);
      if (review) notesParts.push(review);

      records.push({
        sourceTitle: title,
        sourceAuthor: author,
        sourceType: 'book',
        readingStatus: mapGoodreadsShelf(shelf),
        sourceNotes: notesParts.length > 0 ? notesParts.join('\n\n') : null,
        highlightContent: review || null,
        highlightNote: rating && rating !== '0' ? `My Rating: ${rating}/5` : null,
        color: 'yellow',
        location: null,
        tags: parseTagsList(bookshelves),
        highlightedAt: getColumnValue(row, headerMap, ['Date Read', 'Date Added']) || null,
      });
      continue;
    }

    // Readwise, Apple Books, Kobo, or generic highlight CSV
    const highlightContent = getColumnValue(row, headerMap, [
      'Highlight',
      'Selected Text',
      'Text',
      'Quote',
      'Content',
      'Passage',
    ]);
    const sourceTitle =
      getColumnValue(row, headerMap, ['Book Title', 'Title', 'Source', 'Document Title']) ||
      'Imported Book';
    const sourceAuthor =
      getColumnValue(row, headerMap, ['Book Author', 'Author', 'Creator']) || null;
    const note = getColumnValue(row, headerMap, ['Note', 'Annotation', 'Comment']) || null;
    const color = normalizeColor(getColumnValue(row, headerMap, ['Color', 'Highlight Color']));
    const location =
      getColumnValue(row, headerMap, ['Location', 'Page', 'Chapter', 'Position']) || null;
    const tagsRaw =
      getColumnValue(row, headerMap, ['Tags', 'Document Tags', 'Labels']) || undefined;
    const highlightedAt =
      getColumnValue(row, headerMap, ['Highlighted at', 'Date', 'Created At', 'Date Added']) ||
      null;

    if (!highlightContent && !note) continue;

    records.push({
      sourceTitle,
      sourceAuthor,
      sourceType: 'book',
      readingStatus: 'archive',
      sourceNotes: null,
      highlightContent: highlightContent || note,
      highlightNote: highlightContent ? note : null,
      color,
      location,
      tags: parseTagsList(tagsRaw),
      highlightedAt,
    });
  }

  return { detectedFormat, records };
}
