import 'dotenv/config';
import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { asyncRoute } from './lib/asyncRoute.js';
import { logEnvReadiness } from './lib/envCheck.js';
import { logger } from './lib/logger.js';
import { requireClerkIdentity } from './middleware/auth.js';
import { resolveWorkspace } from './middleware/resolveWorkspace.js';
import { billingRouter, stripeWebhookHandler } from './routes/billing.js';
import { workspacesRouter } from './routes/workspaces.js';
import { twilioWebhookRouter } from './routes/twilioWebhook.js';
import { activitiesRouter } from './routes/activities.js';
import { aiRouter } from './routes/ai.js';
import { automationsRouter } from './routes/automations.js';
import { commsRouter } from './routes/comms.js';
import { contactsRouter } from './routes/contacts.js';
import { dealsRouter } from './routes/deals.js';
import { enrichmentRouter } from './routes/enrichment.js';
import { ingestionRouter } from './routes/ingestion.js';
import { leadsRouter } from './routes/leads.js';
import { pipelineRouter } from './routes/pipeline.js';
import { statsRouter } from './routes/stats.js';
import { tasksRouter } from './routes/tasks.js';
import { adminRouter } from './routes/admin.js';

logEnvReadiness('api');

const app = express();
const port = Number(process.env.PORT ?? 4000);

const isProd = process.env.NODE_ENV === 'production';
const corsOrigins = process.env.FRONTEND_ORIGIN?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
app.use(
  cors(
    isProd && corsOrigins.length > 0
      ? { origin: corsOrigins, credentials: true }
      : { origin: true, credentials: true }
  )
);

app.post(
  '/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  asyncRoute(stripeWebhookHandler)
);

app.use(express.json());
app.use('/api/comms/webhook', express.urlencoded({ extended: false }), twilioWebhookRouter);

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ data: null, error: 'Not found' });
};

if (process.env.CLERK_SECRET_KEY?.trim()) {
  app.use('/api/workspaces', requireClerkIdentity, workspacesRouter);
  app.use('/api/admin', adminRouter);
}

app.use('/api/billing', resolveWorkspace, billingRouter);

app.use('/api/leads', resolveWorkspace, leadsRouter);
app.use('/api/contacts', resolveWorkspace, contactsRouter);
app.use('/api/ingestion', resolveWorkspace, ingestionRouter);
app.use('/api/comms', resolveWorkspace, commsRouter);
app.use('/api/ai', resolveWorkspace, aiRouter);
app.use('/api/deals', resolveWorkspace, dealsRouter);
app.use('/api/tasks', resolveWorkspace, tasksRouter);
app.use('/api/activities', resolveWorkspace, activitiesRouter);
app.use('/api/enrichment', resolveWorkspace, enrichmentRouter);
app.use('/api/pipeline', resolveWorkspace, pipelineRouter);
app.use('/api/automations', resolveWorkspace, automationsRouter);
app.use('/api/stats', resolveWorkspace, statsRouter);

app.use(notFound);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error('http.unhandled', { err: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ data: null, error: 'Internal server error' });
};

app.use(errorHandler);

app.listen(port, () => {
  logger.info('api.listen', { port, url: `http://localhost:${port}` });
});
