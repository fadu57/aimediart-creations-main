-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- Migration 71 : lieu de l'exposition (intérieur / extérieur)
-- true  → en intérieur
-- false → en extérieur

ALTER TABLE public.expos
  ADD COLUMN IF NOT EXISTS expo_indoor boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.expos.expo_indoor IS
  'Lieu de l''exposition pour le parcours visiteur : true = en intérieur, false = en extérieur.';
