-- Journalisation des erreurs client — parcours organisateur (staff role 4-6, admins 1-3)
-- Accès lecture : admins globaux (role_id 1-3, rls_is_global_admin)
-- Écriture : Edge Function log-client-error (service role)

CREATE TABLE IF NOT EXISTS public.organizer_error_sessions (
  id uuid PRIMARY KEY,
  auth_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  agency_id uuid REFERENCES public.agencies (id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  user_agent text,
  last_page_url text,
  locale text,
  timezone text
);

COMMENT ON TABLE public.organizer_error_sessions IS
  'Session backoffice organisateur — de la connexion à la déconnexion / fermeture onglet.';

CREATE INDEX IF NOT EXISTS idx_organizer_error_sessions_started_at
  ON public.organizer_error_sessions (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_organizer_error_sessions_auth_user_id
  ON public.organizer_error_sessions (auth_user_id);

CREATE TABLE IF NOT EXISTS public.organizer_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.organizer_error_sessions (id) ON DELETE CASCADE,
  error_message text NOT NULL,
  error_stack text,
  error_source text NOT NULL,
  page_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.organizer_error_logs IS
  'Erreurs capturées côté client pendant une session organisateur.';

CREATE INDEX IF NOT EXISTS idx_organizer_error_logs_session_id
  ON public.organizer_error_logs (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organizer_error_logs_created_at
  ON public.organizer_error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organizer_error_logs_error_source
  ON public.organizer_error_logs (error_source);

CREATE INDEX IF NOT EXISTS idx_visitor_error_logs_error_source
  ON public.visitor_error_logs (error_source);

ALTER TABLE public.organizer_error_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizer_error_sessions_select_admin ON public.organizer_error_sessions;
CREATE POLICY organizer_error_sessions_select_admin
  ON public.organizer_error_sessions
  FOR SELECT
  TO authenticated
  USING (public.rls_is_global_admin());

DROP POLICY IF EXISTS organizer_error_logs_select_admin ON public.organizer_error_logs;
CREATE POLICY organizer_error_logs_select_admin
  ON public.organizer_error_logs
  FOR SELECT
  TO authenticated
  USING (public.rls_is_global_admin());

GRANT SELECT ON public.organizer_error_sessions TO authenticated;
GRANT SELECT ON public.organizer_error_logs TO authenticated;
