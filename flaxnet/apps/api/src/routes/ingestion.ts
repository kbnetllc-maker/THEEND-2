import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncRoute } from '../lib/asyncRoute.js';
import { fail, ok } from '../lib/response.js';
import { importCsvIntoWorkspace } from '../lib/csvImport.js';
import { PAYWALL_MESSAGE, PlanLimitExceededError } from '../lib/planErrors.js';
import { assertLeadsWithinPlan } from '../lib/usageLimits.js';
import { getQueues } from '../lib/queues.js';
import { parseCsvRows } from '../jobs/importJob.js';
import { validateBody } from '../middleware/validate.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const router = Router();

/** Rough non-CSV-aware line count (header + data rows). */
function approximateDataRowCount(buf: Buffer): number {
  const text = buf.toString('utf8');
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

/** First 5 data rows + column names (light parse). */
router.post(
  '/upload',
  upload.single('file'),
  asyncRoute(async (req, res) => {
    const buf = req.file?.buffer;
    if (!buf) {
      res.status(400).json(fail('Expected multipart field "file"'));
      return;
    }
    const previewRows = parseCsvRows(buf, 5);
    if (previewRows.length === 0) {
      res.status(400).json(fail('Empty CSV'));
      return;
    }
    const columns = Object.keys(previewRows[0]!);
    const preview = previewRows;
    const rowCount = approximateDataRowCount(buf);
    res.json(ok({ columns, preview, rowCount }));
  })
);

/**
 * Multipart: file + columnMap (JSON string).
 * Parses full CSV (cap 50k rows), imports synchronously.
 */
router.post(
  '/map',
  upload.single('file'),
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const buf = req.file?.buffer;
    if (!buf) {
      res.status(400).json(fail('Expected multipart field "file"'));
      return;
    }
    let columnMap: Record<string, string>;
    try {
      columnMap = JSON.parse(String(req.body.columnMap ?? '{}')) as Record<string, string>;
    } catch {
      res.status(400).json(fail('Invalid columnMap JSON'));
      return;
    }
    const parsed = z.record(z.string()).safeParse(columnMap);
    if (!parsed.success) {
      res.status(400).json(fail('columnMap must be an object of string keys to header names'));
      return;
    }
    if (!parsed.data.address || !parsed.data.zip) {
      res.status(400).json(fail('columnMap must include address and zip'));
      return;
    }

    const rows = parseCsvRows(buf, 50_000);
    if (rows.length === 0) {
      res.status(400).json(fail('Empty CSV'));
      return;
    }

    try {
      const { imported, duplicates, skippedInvalid } = await importCsvIntoWorkspace({
        workspaceId,
        rows,
        columnMap: parsed.data,
        skipUsageLimits: Boolean(req.isSuperAdmin),
      });
      res.json(ok({ imported, duplicates, skippedInvalid }));
    } catch (e) {
      if (e instanceof PlanLimitExceededError) {
        res.status(403).json(fail(PAYWALL_MESSAGE, { code: 'USAGE_LIMIT' }));
        return;
      }
      console.error('[ingestion map]', e);
      res.status(500).json(fail('Import failed'));
    }
  })
);

/** Async job-based import (optional; same engine as /map). */
router.post(
  '/map-async',
  validateBody(
    z.object({
      columnMap: z.record(z.string()),
      rows: z.array(z.record(z.string())).min(1),
    })
  ),
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const { columnMap, rows } = req.body as {
      columnMap: Record<string, string>;
      rows: Record<string, string>[];
    };
    if (!req.isSuperAdmin) {
      const cap = await assertLeadsWithinPlan(workspaceId, rows.length);
      if (!cap.ok) {
        res.status(403).json(
          fail(PAYWALL_MESSAGE, {
            code: 'USAGE_LIMIT',
            kind: 'leads',
            used: cap.used,
            limit: cap.limit,
          })
        );
        return;
      }
    }
    const job = await prisma.importJob.create({
      data: {
        workspaceId,
        source: 'csv',
        status: 'PENDING',
        totalRows: rows.length,
        columnMap,
      },
    });
    await getQueues().import.add('import-csv', {
      jobId: job.id,
      workspaceId,
      rows,
      columnMap,
      skipUsageLimits: Boolean(req.isSuperAdmin),
    });
    res.status(202).json(ok({ jobId: job.id }));
  })
);

router.get(
  '/jobs',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const jobs = await prisma.importJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(ok(jobs));
  })
);

router.get(
  '/jobs/:id',
  asyncRoute(async (req, res) => {
    const workspaceId = req.workspaceId!;
    const rawId = req.params.id;
    const jobId = Array.isArray(rawId) ? rawId[0] : rawId;
    const job = await prisma.importJob.findFirst({
      where: { id: jobId, workspaceId },
    });
    if (!job) {
      res.status(404).json(fail('Job not found'));
      return;
    }
    res.json(ok(job));
  })
);

router.post(
  '/sheets',
  asyncRoute(async (_req, res) => {
    res.status(501).json(fail('Google Sheets import is V2 per roadmap'));
  })
);

export const ingestionRouter = router;
