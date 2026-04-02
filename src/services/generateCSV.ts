import { stringify } from 'csv-stringify/sync';
import type { ExportRow } from '@/types/index';

const DEFAULT_HEADERS = [
  'name',
  'address',
  'email',
  'phone',
  'lead_status',
  'enriched_email',
  'enriched_phone',
  'company_name',
  'website',
  'notes',
  'formatting_fixes',
  'motivation_score',
  'deal_score',
  'reason',
] as const;

/**
 * Builds a UTF-8 CSV string with headers (original + enriched + scores), with proper escaping.
 *
 * @param rows - Flattened export rows (unknown keys are included as extra columns after defaults)
 * @returns CSV text including header row
 *
 * @throws {Error} If `csv-stringify` fails on malformed data (rare)
 */
export function generateCSV(rows: ExportRow[]): string {
  if (rows.length === 0) {
    return stringify([], { header: true, columns: [...DEFAULT_HEADERS] });
  }

  const extraKeys = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!DEFAULT_HEADERS.includes(k as (typeof DEFAULT_HEADERS)[number])) {
        extraKeys.add(k);
      }
    }
  }

  const columns = [...DEFAULT_HEADERS, ...[...extraKeys].sort()];
  const records = rows.map((r) => {
    const out: Record<string, string | number | null | undefined> = {};
    for (const c of columns) {
      const v = r[c];
      out[c] = v === undefined || v === null ? '' : v;
    }
    return out;
  });

  return stringify(records, {
    header: true,
    columns: columns.map((c) => ({ key: c, header: c })),
    quoted: true,
    quoted_empty: true,
    record_delimiter: '\n',
    bom: true,
  });
}
