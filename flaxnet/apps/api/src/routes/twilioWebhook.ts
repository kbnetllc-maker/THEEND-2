import { Router } from 'express';
import { runAutomations } from '../lib/automationEngine.js';
import { asyncRoute } from '../lib/asyncRoute.js';
import { prisma } from '../lib/prisma.js';
import { normalizePhoneDigits } from '../lib/phoneNormalize.js';

const router = Router();

/**
 * Twilio inbound SMS (application/x-www-form-urlencoded).
 * Configure Twilio "A MESSAGE COMES IN" to POST here.
 * Set TWILIO_WEBHOOK_WORKSPACE_ID to the Workspace id that owns these numbers.
 */
router.post(
  '/twilio',
  asyncRoute(async (req, res) => {
    const workspaceId = process.env.TWILIO_WEBHOOK_WORKSPACE_ID?.trim();
    if (!workspaceId) {
      console.error('[twilio webhook] TWILIO_WEBHOOK_WORKSPACE_ID is not set');
      res.status(503).type('text/xml').send('<Response></Response>');
      return;
    }

    const from = String(req.body?.From ?? '');
    const body = String(req.body?.Body ?? '');
    const sid = String(req.body?.MessageSid ?? '');

    const fromNorm = normalizePhoneDigits(from);
    if (!fromNorm) {
      res.type('text/xml').send('<Response></Response>');
      return;
    }

    const contacts = await prisma.contact.findMany({
      where: { workspaceId, phone: { not: null }, leadId: { not: null } },
      include: { lead: true },
    });

    const hit = contacts.find((c) => {
      const n = normalizePhoneDigits(c.phone ?? '');
      return n === fromNorm;
    });

    if (hit?.leadId) {
      const inboundAt = new Date();
      await prisma.message.create({
        data: {
          workspaceId,
          leadId: hit.leadId,
          contactId: hit.id,
          channel: 'SMS',
          direction: 'INBOUND',
          body,
          status: 'DELIVERED',
          twilioSid: sid || undefined,
          sentBy: 'inbound',
          automation: false,
          metadata: { twilioInbound: true },
        },
      });

      const lastOut = await prisma.message.findFirst({
        where: {
          leadId: hit.leadId,
          workspaceId,
          channel: 'SMS',
          direction: 'OUTBOUND',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (lastOut && !lastOut.replied) {
        const minutes = Math.round((inboundAt.getTime() - lastOut.createdAt.getTime()) / 60_000);
        await prisma.message.update({
          where: { id: lastOut.id },
          data: {
            replied: true,
            responseTimeMinutes: Math.max(0, minutes),
          },
        });
      }
      await prisma.activity.create({
        data: {
          leadId: hit.leadId,
          type: 'SMS',
          body: 'Inbound SMS received',
          createdBy: 'system',
        },
      });
      await runAutomations('MESSAGE_RECEIVED', { leadId: hit.leadId, workspaceId });
    }

    res.type('text/xml').send('<Response></Response>');
  })
);

export const twilioWebhookRouter = router;