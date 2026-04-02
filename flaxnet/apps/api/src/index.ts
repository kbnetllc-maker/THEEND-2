import 'dotenv/config';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { requireDevWorkspace } from './middleware/devWorkspace.js';
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
import { tasksRouter } from './routes/tasks.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(express.json());
app.use('/api/comms/webhook', express.urlencoded({ extended: false }), twilioWebhookRouter);

const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ data: null, error: 'Not found' });
};

app.use('/api/leads', requireDevWorkspace, leadsRouter);
app.use('/api/contacts', requireDevWorkspace, contactsRouter);
app.use('/api/ingestion', requireDevWorkspace, ingestionRouter);
app.use('/api/comms', requireDevWorkspace, commsRouter);
app.use('/api/ai', requireDevWorkspace, aiRouter);
app.use('/api/deals', requireDevWorkspace, dealsRouter);
app.use('/api/tasks', requireDevWorkspace, tasksRouter);
app.use('/api/activities', requireDevWorkspace, activitiesRouter);
app.use('/api/enrichment', requireDevWorkspace, enrichmentRouter);
app.use('/api/pipeline', requireDevWorkspace, pipelineRouter);
app.use('/api/automations', requireDevWorkspace, automationsRouter);

app.use(notFound);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[flaxnet-api]', err);
  res.status(500).json({ data: null, error: 'Internal server error' });
};

app.use(errorHandler);

app.listen(port, () => {
  console.log(`[flaxnet-api] http://localhost:${port}`);
});
