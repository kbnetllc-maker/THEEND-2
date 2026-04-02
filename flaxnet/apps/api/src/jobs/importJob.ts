import { parse } from 'csv-parse/sync';
import { prisma } from '../lib/prisma.js';
import { importCsvIntoWorkspace } from '../lib/csvImport.js';
import { logger } from '../lib/logger.js';

export type ImportJobPayload = {
  jobId: string;
  workspaceId: string;
  rows: Record<string, string>[];
  columnMap: Record<string, string>;
  skipUsageLimits?: boolean;
};

export async function processImportJob(payload: ImportJobPayload): Promise<void> {
  const { jobId, workspaceId, rows, columnMap } = payload;
  await prisma.importJob.update({
    where: { id: jobId },
    data: { status: 'PROCESSING' },
  });
  try {
    const { imported, duplicates, skippedInvalid } = await importCsvIntoWorkspace({
      workspaceId,
      rows,
      columnMap,
      skipUsageLimits: payload.skipUsageLimits,
    });
    const errors = skippedInvalid;
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
  } catch (e) {
    logger.error('import.job_failed', {
      jobId,
      workspaceId,
      err: e instanceof Error ? e.message : String(e),
    });
    await prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', completedAt: new Date() },
    });
  }
}

export function parseCsvRows(buffer: Buffer, maxRows = 50_000): Record<string, string>[] {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    to: maxRows,
  }) as Record<string, string>[];
  return records;
}
