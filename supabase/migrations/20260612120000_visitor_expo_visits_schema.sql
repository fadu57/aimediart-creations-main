-- =============================================================================
-- Schéma : public.visitor_expo_visits + visitor_feedback.visit_id
-- Prérequis : 20260612110000_visitor_expo_visits_prerequisites.sql
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.visitors') IS NULL
     OR to_regclass('public.expos') IS NULL
     OR to_regclass('public.agencies') IS NULL
     OR to_regclass('public.visitor_feedback') IS NULL THEN
    RAISE EXCEPTION
      'Appliquer d''abord 20260612110000_visitor_expo_visits_prerequisites.sql';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visitor_expo_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES public.visitors (id) ON DELETE CASCADE,
  expo_id uuid NOT NULL REFERENCES public.expos (id) ON DELETE CASCADE,
  agency_id uuid REFERENCES public.agencies (id) ON DELETE SET NULL,
  auth_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  entry_source text,
  status text NOT NULL DEFAULT 'active',
  entered_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_activity_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT visitor_expo_visits_status_chk
    CHECK (status IN ('active', 'ended', 'abandoned')),

  CONSTRAINT visitor_expo_visits_dates_chk
    CHECK (ended_at IS NULL OR ended_at >= entered_at),

  CONSTRAINT visitor_expo_visits_active_ended_chk
    CHECK (
      (status = 'active' AND ended_at IS NULL)
      OR (status IN ('ended', 'abandoned') AND ended_at IS NOT NULL)
    )
);

COMMENT ON TABLE public.visitor_expo_visits IS
  'Historique canonique des passages visiteur dans une exposition.';
COMMENT ON COLUMN public.visitor_expo_visits.agency_id IS
  'Dénormalisé depuis public.expos.agency_id au démarrage.';
COMMENT ON COLUMN public.visitor_expo_visits.auth_user_id IS
  'auth.uid() capturé au start_visitor_expo_visit (si session auth).';
COMMENT ON COLUMN public.visitor_expo_visits.entry_source IS
  'visitor_welcome | resume | direct_link | first_scan | artwork_page | unknown';

-- ---------------------------------------------------------------------------
-- Index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_visitor_expo_visits_visitor_id
  ON public.visitor_expo_visits (visitor_id);

CREATE INDEX IF NOT EXISTS idx_visitor_expo_visits_expo_id
  ON public.visitor_expo_visits (expo_id);

CREATE INDEX IF NOT EXISTS idx_visitor_expo_visits_agency_id
  ON public.visitor_expo_visits (agency_id)
  WHERE agency_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_expo_visits_auth_user_id
  ON public.visitor_expo_visits (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_expo_visits_status
  ON public.visitor_expo_visits (status);

CREATE INDEX IF NOT EXISTS idx_visitor_expo_visits_visitor_entered
  ON public.visitor_expo_visits (visitor_id, entered_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitor_expo_visits_expo_entered
  ON public.visitor_expo_visits (expo_id, entered_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visitor_expo_visits_one_active_per_pair
  ON public.visitor_expo_visits (visitor_id, expo_id)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Lien visitor_feedback → session (Option A)
-- ---------------------------------------------------------------------------
ALTER TABLE public.visitor_feedback
  ADD COLUMN IF NOT EXISTS visit_id uuid
    REFERENCES public.visitor_expo_visits (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_feedback_visit_id
  ON public.visitor_feedback (visit_id)
  WHERE visit_id IS NOT NULL;

COMMENT ON COLUMN public.visitor_feedback.visit_id IS
  'FK optionnelle vers visitor_expo_visits. Indépendant de visitor_feedback.visitor_id (sémantique client).';

-- ---------------------------------------------------------------------------
-- Trigger updated_at
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS visitor_expo_visits_updated_at ON public.visitor_expo_visits;

CREATE TRIGGER visitor_expo_visits_updated_at
  BEFORE UPDATE ON public.visitor_expo_visits
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- RLS activée ici ; policies dans la migration suivante (ordre sûr)
ALTER TABLE public.visitor_expo_visits ENABLE ROW LEVEL SECURITY;

-- Pas de policy ni GRANT ici : table inaccessible en lecture directe
-- jusqu'à application de 20260612120100 (comportement sûr intermédiaire).
