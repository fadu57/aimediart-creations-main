-- Migration : journalisation des erreurs client pendant une session visiteur
-- Accès lecture : admins globaux (role_id 1-3, rls_is_global_admin)
-- Écriture : Edge Function log-visitor-error (service role)

CREATE TABLE IF NOT EXISTS public.visitor_error_sessions (
  id uuid PRIMARY KEY,
  visitor_client_id text,
  auth_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  expo_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  user_agent text,
  last_page_url text,
  locale text,
  timezone text
);

COMMENT ON TABLE public.visitor_error_sessions IS
  'Session de navigation visiteur (connexion anonyme ou auth role 7) — du début au signOut / fermeture onglet.';

CREATE INDEX IF NOT EXISTS idx_visitor_error_sessions_started_at
  ON public.visitor_error_sessions (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_error_sessions_visitor_client_id
  ON public.visitor_error_sessions (visitor_client_id);

CREATE TABLE IF NOT EXISTS public.visitor_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.visitor_error_sessions (id) ON DELETE CASCADE,
  error_message text NOT NULL,
  error_stack text,
  error_source text NOT NULL,
  page_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.visitor_error_logs IS
  'Erreurs JavaScript capturées côté client pendant une session visiteur.';

CREATE INDEX IF NOT EXISTS idx_visitor_error_logs_session_id
  ON public.visitor_error_logs (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_error_logs_created_at
  ON public.visitor_error_logs (created_at DESC);

ALTER TABLE public.visitor_error_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visitor_error_sessions_select_admin ON public.visitor_error_sessions;
CREATE POLICY visitor_error_sessions_select_admin
  ON public.visitor_error_sessions
  FOR SELECT
  TO authenticated
  USING (public.rls_is_global_admin());

DROP POLICY IF EXISTS visitor_error_logs_select_admin ON public.visitor_error_logs;
CREATE POLICY visitor_error_logs_select_admin
  ON public.visitor_error_logs
  FOR SELECT
  TO authenticated
  USING (public.rls_is_global_admin());

GRANT SELECT ON public.visitor_error_sessions TO authenticated;
GRANT SELECT ON public.visitor_error_logs TO authenticated;
