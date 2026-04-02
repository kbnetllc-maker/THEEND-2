import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/auth.js';
import { ok } from './lib/response.js';
import { leadsRouter } from './routes/leads.js';
import { contactsRouter } from './routes/contacts.js';
import { pipelineRouter } from './routes/pipeline.js';
import { dealsRouter } from './routes/deals.js';
import { tasksRouter } from './routes/tasks.js';
import { commsRouter } from './routes/comms.js';
import { ingestionRouter } from './routes/ingestion.js';
import { aiRouter } from './routes/ai.js';
import { enrichmentRouter } from './routes/enrichment.js';
import { automationsRouter } from './routes/automations.js';
import { activitiesRouter } from './routes/activities.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors({ origin: true, credentials: true }));
app.post('/api/comms/webhook/twilio', express.urlencoded({ extended: false }), (_req, res) => {
  res.status(501).json({ data: null, error: 'Twilio inbound webhook — implement verify + persist' });
});
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json(ok({ service: 'flaxnet-api', version: '0.0.1' }));
});

app.use('/api/leads', requireAuth, leadsRouter);
app.use('/api/contacts', requireAuth, contactsRouter);
app.use('/api/pipeline', requireAuth, pipelineRouter);
app.use('/api/deals', requireAuth, dealsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/comms', requireAuth, commsRouter);
app.use('/api/ingestion', requireAuth, ingestionRouter);
app.use('/api/ai', requireAuth, aiRouter);
app.use('/api/enrichment', requireAuth, enrichmentRouter);
app.use('/api/automations', requireAuth, automationsRouter);
app.use('/api/activities', requireAuth, activitiesRouter);

app.use((_req, res) => {
  res.status(404).json({ data: null, error: 'Not found' });
});

app.listen(port, () => {
  console.log(`[flaxnet-api] http://localhost:${port}`);
});
