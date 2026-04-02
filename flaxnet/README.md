# Flaxnet (Dealflow OS)

Monorepo scaffold per the Flaxnet master spec: **Vite + React 18** web app, **Express + Prisma + PostgreSQL** API, **BullMQ + Redis** workers, **Claude** agents, **Clerk** auth.

## Layout

- `apps/web` — UI (TanStack Query, Zustand, Tailwind, React Router)
- `apps/api` — REST API (`/api/*`), Prisma schema, agents, job processors
- `packages/shared` — shared types (`ApiResponse`)

## Prerequisites

- Node 20+
- PostgreSQL (`DATABASE_URL`)
- Redis (`REDIS_URL`) for queues + `npm run worker` in `apps/api`
- Clerk app (`CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`)

## First-time setup

```bash
cd flaxnet
npm install
```

If `npm install` fails on Windows (e.g. `ENOTEMPTY` under OneDrive), run it again or install from a non-synced folder.

```bash
cd apps/api
cp ../../.env.example .env   # or create .env with DATABASE_URL, REDIS_URL, CLERK_SECRET_KEY, ANTHROPIC_API_KEY
npx prisma migrate dev --name init
npx prisma generate
```

Create a **Workspace** and **WorkspaceMember** row linking your Clerk `user id` to `workspaceId` (SQL or Prisma Studio) so `requireAuth` can resolve `req.workspaceId`.

```bash
# Terminal 1 — API
cd apps/api && npm run dev

# Terminal 2 — workers (needs Redis)
cd apps/api && npm run worker

# Terminal 3 — web
cd apps/web && npm run dev
```

Web defaults to `http://localhost:5173` with Vite proxying `/api` → `http://localhost:4000`.

## What’s implemented (MVP slice)

- Full Prisma schema (Section 2)
- Route modules for leads, contacts, pipeline, deals, tasks, comms, ingestion, AI, enrichment, automations, activities
- Agents: Planner, Enrichment, Scoring, DealAnalyzer, Outreach, Validator (Zod)
- BullMQ workers: enrichment → scoring chain, outreach (Twilio when configured), CSV import
- `dealCalc.ts` MAO helper
- Web shell: sidebar, all page stubs, Leads table wired to `GET /api/leads`

## Next sessions (master prompt order)

1. Twilio inbound webhook + signature verification  
2. TanStack Virtual on Leads + optimistic PATCH  
3. Pipeline `@dnd-kit` + `PATCH` stage moves  
4. CSV import: persist upload server-side so `/ingestion/map` does not require client to resend rows  
5. Automation engine evaluation (V2)  
6. Google Sheets + Resend (V2/V3 per roadmap)

The **LeadEnrichAI** app in the repo root (`../`) is unchanged; Flaxnet lives under `flaxnet/`.
