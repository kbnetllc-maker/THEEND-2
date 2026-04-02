import { parse } from 'csv-parse/sync';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export type ImportJobPayload = {
  jobId: string;
  workspaceId: string;
  rows: Record<string, string>[];
  columnMap: Record<string, string>;
};

/**
 * Map CSV rows → Lead rows, dedupe by address+zip, chunk insert (500).
 */
export async function processImportJob(payload: ImportJobPayload): Promise<void> {
  const { jobId, workspaceId, rows, columnMap } = payload;
  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: 'PROCESSING' },
  });
  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  const batch: Prisma.LeadCreateManyInput[] = [];

  const flushChunk = async (slice: Prisma.LeadCreateManyInput[]) => {
    if (slice.length === 0) return;
    try {
      await prisma.lead.createMany({ data: slice });
      imported += slice.length;
    } catch {
      errors += slice.length;
    }
  };

  for (const row of rows) {
    const get = (k: string) => row[columnMap[k] ?? k]?.trim() ?? '';
    const address = get('address');
    const zip = get('zip');
    if (!address || !zip) {
      errors += 1;
      continue;
    }
    const existing = await prisma.lead.findFirst({
      where: { workspaceId, address, zip, isArchived: false },
    });
    if (existing) {
      duplicates += 1;
      continue;
    }
    batch.push({
      workspaceId,
      address,
      city: get('city') || 'Unknown',
      state: get('state') || 'XX',
      zip,
      county: get('county') || null,
      source: 'csv_upload',
      status: 'NEW',
    });
    if (batch.length >= 500) await flushChunk(batch.splice(0, 500));
  }
  while (batch.length) {
    await flushChunk(batch.splice(0, 500));
  }

  await prisma.importJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      imported,
      duplicates,
      errors,
      completedAt: new Date(),
      totalRows: rows.length,
    },
  });
}

export function parseCsvRows(buffer: Buffer, maxRows = 50_000): Record<string, string>[] {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    to_line: maxRows + 1,
  }) as Record<string, string>[];
  return records;
}
