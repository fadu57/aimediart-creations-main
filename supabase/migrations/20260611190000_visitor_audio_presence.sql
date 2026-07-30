-- Migration : présence visiteur audio + bannissement admin (expo intérieure)

CREATE TABLE IF NOT EXISTS public.visitor_audio_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_client_id text NOT NULL,
  expo_id uuid REFERENCES public.expos (id) ON DELETE SET NULL,
  artwork_id uuid,
  artwork_title text,
  page_url text,
  headphones_detected boolean,
  banned_at timestamptz,
  banned_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ban_reason text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visitor_audio_presence_visitor_client_id_chk
    CHECK (char_length(trim(visitor_client_id)) > 0)
);

COMMENT ON TABLE public.visitor_audio_presence IS
  'Présence temps réel des visiteurs en expo intérieure — position QR + statut bannissement audio.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_visitor_audio_presence_client
  ON public.visitor_audio_presence (visitor_client_id);

CREATE INDEX IF NOT EXISTS idx_visitor_audio_presence_expo_last_seen
  ON public.visitor_audio_presence (expo_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_audio_presence_banned
  ON public.visitor_audio_presence (banned_at)
  WHERE banned_at IS NOT NULL;

ALTER TABLE public.visitor_audio_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visitor_audio_presence_select_admin ON public.visitor_audio_presence;
CREATE POLICY visitor_audio_presence_select_admin
  ON public.visitor_audio_presence
  FOR SELECT
  TO authenticated
  USING (public.rls_is_global_admin());

GRANT SELECT ON public.visitor_audio_presence TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'visitor_audio_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.visitor_audio_presence;
  END IF;
END $$;
