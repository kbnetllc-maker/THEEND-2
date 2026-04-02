import { Router } from 'express';
import multer from 'multer';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { getRedisConnection } from '../lib/redis.js';
import { importCsvIntoWorkspace } from '../lib/csvImport.js';
import { parseCsvRows } from '../jobs/importJob.js';
import { validateBody } from '../middleware/validate.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const router = Router();

let importQueue: Queue | null = null;
function getImportQueue() {
  if (!importQueue) importQueue = new Queue('import', { connection: getRedisConnection() });
  return importQueue;
}

/** Rough non-CSV-aware line count (header + data rows). */
function approximateDataRowCount(buf: Buffer): number {
  const text = buf.toString('utf8');
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

/** First 5 data rows + column names (light parse). */
router.post('/upload', upload.single('file'), async (req, res) => {
  const buf = req.file?.buffer;
  if (!buf) return res.status(400).json(fail('Expected multipart field "file"'));
  const previewRows = parseCsvRows(buf, 5);
  if (previewRows.length === 0) return res.status(400).json(fail('Empty CSV'));
  const columns = Object.keys(previewRows[0]!);
  const preview = previewRows;
  const rowCount = approximateDataRowCount(buf);
  res.json(ok({ columns, preview, rowCount }));
});

/**
 * Multipart: file + columnMap (JSON string).
 * Parses full CSV (cap 50k rows), imports synchronously.
 */
router.post('/map', upload.single('file'), async (req, res) => {
  const workspaceId = req.workspaceId!;
  const buf = req.file?.buffer;
  if (!buf) return res.status(400).json(fail('Expected multipart field "file"'));
  let columnMap: Record<string, string>;
  try {
    columnMap = JSON.parse(String(req.body.columnMap ?? '{}')) as Record<string, string>;
  } catch {
    return res.status(400).json(fail('Invalid columnMap JSON'));
  }
  const parsed = z.record(z.string()).safeParse(columnMap);
  if (!parsed.success) {
    return res.status(400).json(fail('columnMap must be an object of string keys to header names'));
  }
  if (!parsed.data.address || !parsed.data.zip) {
    return res.status(400).json(fail('columnMap must include address and zip'));
  }

  const rows = parseCsvRows(buf, 50_000);
  if (rows.length === 0) return res.status(400).json(fail('Empty CSV'));

  try {
    const { imported, duplicates, skippedInvalid } = await importCsvIntoWorkspace({
      workspaceId,
      rows,
      columnMap: parsed.data,
    });
    res.json(ok({ imported, duplicates, skippedInvalid }));
  } catch (e) {
    console.error('[ingestion map]', e);
    res.status(500).json(fail('Import failed'));
  }
});

/** Async job-based import (optional; same engine as /map). */
router.post(
  '/map-async',
  validateBody(
    z.object({
      columnMap: z.record(z.string()),
      rows: z.array(z.record(z.string())).min(1),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const { columnMap, rows } = req.body as {
      columnMap: Record<string, string>;
      rows: Record<string, string>[];
    };
    const job = await prisma.importJob.create({
      data: {
        workspaceId,
        source: 'csv',
        status: 'PENDING',
        totalRows: rows.length,
        columnMap,
      },
    });
    await getImportQueue().add('import-csv', {
      jobId: job.id,
      workspaceId,
      rows,
      columnMap,
    });
    res.status(202).json(ok({ jobId: job.id }));
  }
);

router.get('/jobs', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const jobs = await prisma.importJob.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json(ok(jobs));
});

router.get('/jobs/:id', async (req, res) => {
  const workspaceId = req.workspaceId!;
  const job = await prisma.importJob.findFirst({
    where: { id: req.params.id, workspaceId },
  });
  if (!job) return res.status(404).json(fail('Job not found'));
  res.json(ok(job));
});

router.post('/sheets', async (_req, res) => {
  res.status(501).json(fail('Google Sheets import is V2 per roadmap'));
});

export const ingestionRouter = router;
