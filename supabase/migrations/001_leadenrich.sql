-- LeadEnrichAI schema: profiles, leads, enrichment, scores, logs, batches
-- RLS uses auth.uid(); server uses service role and must still filter by user_id in app code.

-- -----------------------------------------------------------------------------
-- Helper: updated_at touch
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_created_at_idx ON public.profiles (created_at);

-- -----------------------------------------------------------------------------
-- batches (created before leads in upload flow; referenced by leads.batch_id)
-- -----------------------------------------------------------------------------
CREATE TABLE public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  storage_path text,
  total_rows int,
  processed_rows int NOT NULL DEFAULT 0,
  failed_rows int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  result_csv_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT batches_status_chk CHECK (status IN ('queued', 'processing', 'completed', 'failed'))
);

CREATE INDEX batches_user_id_idx ON public.batches (user_id);
CREATE INDEX batches_status_idx ON public.batches (status);

CREATE TRIGGER batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- leads
-- -----------------------------------------------------------------------------
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.batches (id) ON DELETE CASCADE,
  name text,
  address text,
  email text,
  phone text,
  raw_row jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_status_chk CHECK (status IN ('pending', 'enriching', 'scoring', 'completed', 'failed'))
);

CREATE INDEX leads_user_batch_idx ON public.leads (user_id, batch_id);
CREATE INDEX leads_batch_id_idx ON public.leads (batch_id);
CREATE INDEX leads_status_idx ON public.leads (status);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- enriched_data
-- -----------------------------------------------------------------------------
CREATE TABLE public.enriched_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.leads (id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX enriched_data_lead_id_idx ON public.enriched_data (lead_id);

CREATE TRIGGER enriched_data_updated_at
  BEFORE UPDATE ON public.enriched_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- scores
-- -----------------------------------------------------------------------------
CREATE TABLE public.scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.leads (id) ON DELETE CASCADE,
  motivation_score int NOT NULL,
  deal_score int NOT NULL,
  reason text NOT NULL,
  raw_model_output jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scores_motivation_chk CHECK (motivation_score BETWEEN 1 AND 10),
  CONSTRAINT scores_deal_chk CHECK (deal_score BETWEEN 1 AND 10)
);

CREATE INDEX scores_lead_id_idx ON public.scores (lead_id);

-- -----------------------------------------------------------------------------
-- logs
-- -----------------------------------------------------------------------------
CREATE TABLE public.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  batch_id uuid,
  lead_id uuid,
  type text NOT NULL,
  level text NOT NULL,
  message text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT logs_level_chk CHECK (level IN ('info', 'warn', 'error'))
);

CREATE INDEX logs_user_id_idx ON public.logs (user_id);
CREATE INDEX logs_batch_id_idx ON public.logs (batch_id);
CREATE INDEX logs_created_at_idx ON public.logs (created_at);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enriched_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

-- profiles: own row only
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- batches
CREATE POLICY batches_select_own ON public.batches
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY batches_insert_own ON public.batches
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY batches_update_own ON public.batches
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY batches_delete_own ON public.batches
  FOR DELETE USING (user_id = auth.uid());

-- leads
CREATE POLICY leads_select_own ON public.leads
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY leads_insert_own ON public.leads
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY leads_update_own ON public.leads
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY leads_delete_own ON public.leads
  FOR DELETE USING (user_id = auth.uid());

-- enriched_data via owning lead
CREATE POLICY enriched_data_select_own ON public.enriched_data
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.user_id = auth.uid())
  );
CREATE POLICY enriched_data_insert_own ON public.enriched_data
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.user_id = auth.uid())
  );
CREATE POLICY enriched_data_update_own ON public.enriched_data
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.user_id = auth.uid())
  );
CREATE POLICY enriched_data_delete_own ON public.enriched_data
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.user_id = auth.uid())
  );

-- scores via owning lead
CREATE POLICY scores_select_own ON public.scores
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.user_id = auth.uid())
  );
CREATE POLICY scores_insert_own ON public.scores
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.user_id = auth.uid())
  );
CREATE POLICY scores_update_own ON public.scores
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.user_id = auth.uid())
  );
CREATE POLICY scores_delete_own ON public.scores
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.user_id = auth.uid())
  );

-- logs: users see only their rows (server uses service role for writes)
CREATE POLICY logs_select_own ON public.logs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY logs_insert_own ON public.logs
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Storage bucket (private)
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('csv-uploads', 'csv-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users may manage objects under their user_id prefix (optional client flows)
CREATE POLICY csv_uploads_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'csv-uploads' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY csv_uploads_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'csv-uploads' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY csv_uploads_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'csv-uploads' AND split_part(name, '/', 1) = auth.uid()::text);

CREATE POLICY csv_uploads_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'csv-uploads' AND split_part(name, '/', 1) = auth.uid()::text);
