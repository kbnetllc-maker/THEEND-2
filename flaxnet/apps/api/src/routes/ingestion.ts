import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { fail, ok } from '../lib/response.js';
import { getQueues } from '../lib/queues.js';
import { parseCsvRows } from '../jobs/importJob.js';
import { validateBody } from '../middleware/validate.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const router = Router();

router.post('/upload', upload.single('file'), async (req, res) => {
  const workspaceId = req.workspaceId!;
  const buf = req.file?.buffer;
  if (!buf) return res.status(400).json(fail('Expected multipart field "file"'));
  const rows = parseCsvRows(buf, 10_000);
  if (rows.length === 0) return res.status(400).json(fail('Empty CSV'));
  const columns = Object.keys(rows[0]!);
  const preview = rows.slice(0, 5);
  res.json(ok({ columns, preview, rowCount: rows.length }));
});

router.post(
  '/map',
  validateBody(
    z.object({
      columnMap: z.record(z.string()),
      rows: z.array(z.record(z.string())).optional(),
      fileToken: z.string().optional(),
    })
  ),
  async (req, res) => {
    const workspaceId = req.workspaceId!;
    const { columnMap, rows } = req.body as {
      columnMap: Record<string, string>;
      rows?: Record<string, string>[];
    };
    if (!rows?.length) {
      return res.status(400).json(fail('MVP: pass rows from client after /upload preview, or add file storage'));
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
