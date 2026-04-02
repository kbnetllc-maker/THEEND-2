-- Worker query optimization: pending leads by batch + status
-- If 001 already ran in prod, apply this only (skip full 001 replay).
CREATE INDEX IF NOT EXISTS leads_batch_id_status_idx ON public.leads (batch_id, status);
