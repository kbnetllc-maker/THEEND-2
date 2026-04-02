# LeadEnrichAI (MVP)

Node.js 20+ API for CSV lead uploads, **Claude**-first enrichment and scoring (optional **OpenAI** via `AI_PROVIDER`), **Supabase** (Postgres + Auth + Storage), background batch processing, and signed download URLs for result CSVs.

## Quick start

1. Copy `.env.example` to `.env` and fill values (see below).
2. In Supabase: run SQL migration, ensure Storage bucket exists (migration creates `csv-uploads`).
3. `npm install` → `npm run dev`

## Environment

See `.env.example`. Server-only secrets:

- `SUPABASE_SERVICE_ROLE_KEY` — never expose to browsers; used for DB, Storage, and JWT verification via `auth.getUser(jwt)`.
- `ANTHROPIC_API_KEY` — primary LLM.
- `OPENAI_API_KEY` — optional; used when `AI_PROVIDER=openai` or `claude_then_openai`.
- `BATCH_CONCURRENCY` — parallel lead pipelines per batch (default `5`, clamped between **3** and **10**).

## Supabase setup

1. **Run migration**  
   Apply `supabase/migrations/001_leadenrich.sql` in the SQL editor (or `supabase db push` if you use the Supabase CLI). This creates:

   - Tables: `profiles`, `batches`, `leads`, `enriched_data`, `scores`, `logs`
   - RLS policies scoped with `auth.uid()`
   - Private bucket `csv-uploads` and path policies (`{user_id}/...`)

2. **Auth**  
   Enable Email (or your provider). Create a test user and copy a **JWT** (anon key + client sign-in, or Dashboard) for API calls.

3. **Keys**  
   Project URL + **service role** key go in `.env` for this server. The **anon** key is optional here (reserved for a future browser client).

## API

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | No |
| POST | `/api/uploads` | Bearer JWT |
| GET | `/api/batches/:id` | Bearer JWT |
| GET | `/api/batches/:id/download` | Bearer JWT |

- **POST `/api/uploads`** — `multipart/form-data` field **`file`** (CSV). Creates a batch, stores `original.csv` at `{user_id}/{batch_id}/original.csv`, parses rows, bulk-inserts `leads`, enqueues background processing. Response: `{ batchId, totalRows, parseWarnings? }`.
- **GET `/api/batches/:id`** — Batch row + optional `recentErrors` from `logs`.
- **GET `/api/batches/:id/download`** — When `status === completed`, returns `{ url, expiresIn }` (signed URL, 300s).

## Scripts

- `npm run dev` — `tsx watch src/index.ts`
- `npm run build` — compile to `dist/`
- `npm start` — `node dist/index.js`
- `npm run typecheck` — `tsc --noEmit`

## Architecture notes

- **JWT:** `Authorization: Bearer <access_token>`; verified with `supabase.auth.getUser(jwt)` using the service client.
- **RLS:** Service role bypasses RLS; application code still filters by `user_id` on every query/update.
- **Jobs:** `enqueueBatchProcessing` uses `setImmediate` (in-process). For **10k+ rows** or isolation, move `processBatch` to a worker (BullMQ, separate Node process, or Supabase Edge Functions) and enqueue there instead.
- **Large CSVs:** The MVP parses the upload in memory; for very large files, switch to a streaming `csv-parse` pipeline and chunk inserts (this repo already inserts leads in chunks of up to 750 rows).

## Manual test checklist

1. Obtain a Supabase user **access token** (JWT).
2. `curl -H "Authorization: Bearer $JWT" -F "file=@sample.csv" http://localhost:3000/api/uploads`
3. Poll `GET /api/batches/<batchId>` until `batch.status` is `completed` (or `failed`).
4. `GET /api/batches/<batchId>/download` and open the signed URL to download `export.csv`.
5. Confirm rows in `leads`, `enriched_data`, `scores`, and `logs` in the Supabase Table Editor.

## Sample CSV

```csv
name,email,phone,address
Jane Doe,jane@example.com,555-0100,"123 Main St, Springfield"
```

At least **name** or a sufficiently long **address** is required per row.
