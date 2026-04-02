import { parse } from 'csv-parse/sync';

const CORE_KEYS = ['name', 'address', 'email', 'phone'] as const;
const MIN_ADDRESS_LEN = 5;

export interface ParseCSVOptions {
  /** Optional cap for very large files (MVP safety). */
  maxRows?: number;
}

/** One parsed CSV row: core columns plus extra columns in `raw_row` for audit. */
export interface ParsedCSVRow {
  name: string;
  address: string;
  email: string;
  phone: string;
  raw_row: Record<string, string>;
}

function normHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase();
}

/**
 * Parses a CSV buffer into normalized lead-shaped rows and collects row-level issues.
 * Maps `name`, `address`, `email`, `phone` case-insensitively; other columns are preserved in `raw_row`.
 *
 * @param buffer - Raw CSV file bytes (UTF-8)
 * @param options - Optional `maxRows` cap
 * @returns `rows` plus `errors` (file-level and row-level messages)
 *
 * Expected errors (non-throwing): malformed CSV → `errors` with parse message; invalid rows → per-row messages.
 * Does **not** throw for row-level validation; returns an empty `rows` array when the file cannot be parsed.
 */
export function parseCSV(
  buffer: Buffer,
  options: ParseCSVOptions = {}
): { rows: ParsedCSVRow[]; errors: string[] } {
  const errors: string[] = [];
  const text = buffer.toString('utf8');
  let records: Record<string, string>[] = [];

  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    }) as Record<string, string>[];
  } catch (e) {
    errors.push(`CSV parse failed: ${e instanceof Error ? e.message : String(e)}`);
    return { rows: [], errors };
  }

  if (options.maxRows !== undefined && records.length > options.maxRows) {
    errors.push(`Truncated to maxRows=${options.maxRows}`);
    records = records.slice(0, options.maxRows);
  }

  const rows: ParsedCSVRow[] = [];

  records.forEach((rec, idx) => {
    const rowIndex = idx + 2;
    const raw_row: Record<string, string> = {};
    const mapped = {
      name: '',
      address: '',
      email: '',
      phone: '',
    };

    const headerMap = new Map<string, string>();
    for (const key of Object.keys(rec)) {
      const nk = normHeader(key);
      headerMap.set(nk, rec[key] ?? '');
    }

    for (const ck of CORE_KEYS) {
      if (headerMap.has(ck)) {
        mapped[ck] = headerMap.get(ck) || '';
        headerMap.delete(ck);
      }
    }

    for (const [k, v] of headerMap.entries()) {
      raw_row[k] = v;
    }

    const nameOk = mapped.name.trim().length > 0;
    const addr = mapped.address.trim();
    const addrOk = addr.length >= MIN_ADDRESS_LEN;

    if (!nameOk && !addrOk) {
      errors.push(`Row ${rowIndex}: require name OR address (>= ${MIN_ADDRESS_LEN} chars)`);
      return;
    }

    rows.push({
      ...mapped,
      raw_row,
    });
  });

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No data rows found after header');
  }

  return { rows, errors };
}
