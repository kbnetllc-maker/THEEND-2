import { parse } from 'csv-parse/sync';
import { prisma } from '../lib/prisma.js';
import { importCsvIntoWorkspace } from '../lib/csvImport.js';

export type ImportJobPayload = {
  jobId: string;
  workspaceId: string;
  rows: Record<string, string>[];
  columnMap: Record<string, string>;
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
  } catch {
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
