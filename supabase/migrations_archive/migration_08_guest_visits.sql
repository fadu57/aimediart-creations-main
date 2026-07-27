-- migration_08_guest_visits.sql
-- Table de visites anonymes par exposition (scan QR).

BEGIN;

CREATE TABLE IF NOT EXISTS public.guest_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_uuid text NOT NULL,
  user_id uuid NULL,
  expo_id uuid NULL,
  language text NULL,
  timezone text NULL,
  ip_address text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_visits
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS ip_address text;

CREATE INDEX IF NOT EXISTS idx_guest_visits_visitor_uuid ON public.guest_visits(visitor_uuid);
CREATE INDEX IF NOT EXISTS idx_guest_visits_expo_id ON public.guest_visits(expo_id);
CREATE INDEX IF NOT EXISTS idx_guest_visits_user_id ON public.guest_visits(user_id);

COMMIT;

