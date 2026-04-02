import type { Activity, Contact, Lead, PipelineStage } from '@prisma/client';
import { claudeJson } from '../lib/claude.js';
import { z } from 'zod';

export type LeadWithContacts = Lead & { contacts: Contact[] };

export type PlannerInput = {
  lead: LeadWithContacts;
  recentActivities: Activity[];
  workspaceContext: { stages: PipelineStage[] };
};

const plannerOutputSchema = z.object({
  recommendedActions: z
    .array(
      z.object({
        type: z.enum(['ENRICH', 'SCORE', 'OUTREACH', 'TASK', 'FLAG']),
        reason: z.string().max(200),
        priority: z.number().min(1).max(5),
      })
    )
    .max(3),
  summary: z.string(),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

const PLANNER_PROMPT = `You are a real estate wholesaling assistant. Analyze this lead and decide what to do next.

Return ONLY valid JSON matching this schema:
{
  "recommendedActions": [
    {
      "type": "ENRICH" | "SCORE" | "OUTREACH" | "TASK" | "FLAG",
      "reason": "string (max 100 chars)",
      "priority": 1-5
    }
  ],
  "summary": "2-3 sentence plain English summary of this lead's situation"
}

Rules:
- ENRICH if contact info is missing
- SCORE if aiScore is null or >30 days old
- OUTREACH if score > 60 and no contact in 7+ days
- TASK if follow-up is overdue
- FLAG if tax delinquent + equity > 40%
- Maximum 3 actions`;

export class PlannerAgent {
  async run(input: PlannerInput): Promise<PlannerOutput> {
    const user = `Lead Data:
${JSON.stringify(input.lead)}

Recent Activities (last 30 days):
${JSON.stringify(input.recentActivities)}

Pipeline Stages Available:
${JSON.stringify(input.workspaceContext.stages)}`;
    const raw = await claudeJson(PLANNER_PROMPT, user);
    return plannerOutputSchema.parse(raw);
  }
}
