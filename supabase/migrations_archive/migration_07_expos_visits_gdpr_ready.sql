-- migration_07_expos_visits_gdpr_ready.sql
-- Prépare la capture anonyme multi-expo + consentement RGPD.

BEGIN;

-- Table cible standardisée (créée si absente)
CREATE TABLE IF NOT EXISTS public.expos_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_uuid text NOT NULL,
  user_id uuid NULL,
  expo_id uuid NULL,
  language text NULL,
  timezone text NULL,
  ip_address text NULL,
  gdpr_consent boolean NOT NULL DEFAULT false,
  consent_date timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expos_visits_visitor_uuid ON public.expos_visits(visitor_uuid);
CREATE INDEX IF NOT EXISTS idx_expos_visits_expo_id ON public.expos_visits(expo_id);
CREATE INDEX IF NOT EXISTS idx_expos_visits_user_id ON public.expos_visits(user_id);

-- Compatibilité : si vous avez déjà public.visites ou public.guest_visits, on ajoute les champs RGPD/capture
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['visites', 'guest_visits', 'expos_visits']
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I
           ADD COLUMN IF NOT EXISTS visitor_uuid text,
           ADD COLUMN IF NOT EXISTS user_id uuid,
           ADD COLUMN IF NOT EXISTS expo_id uuid,
           ADD COLUMN IF NOT EXISTS language text,
           ADD COLUMN IF NOT EXISTS timezone text,
           ADD COLUMN IF NOT EXISTS ip_address text,
           ADD COLUMN IF NOT EXISTS gdpr_consent boolean DEFAULT false,
           ADD COLUMN IF NOT EXISTS consent_date timestamptz',
        tbl
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

