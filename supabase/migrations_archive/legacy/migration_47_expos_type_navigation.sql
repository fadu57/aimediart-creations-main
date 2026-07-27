-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- Migration 47 : ajout de la colonne type_navigation sur la table expos
-- true  → "Œuvres scannées l'une après l'autre"
-- false → "Une œuvre scannée donne toutes les œuvres du même artiste"
-- NULL  → comportement par défaut (false implicite côté front)

ALTER TABLE public.expos
  ADD COLUMN IF NOT EXISTS type_navigation boolean DEFAULT false;

COMMENT ON COLUMN public.expos.type_navigation IS
  'Mode de navigation des œuvres du visiteur : true = scan séquentiel (une œuvre à la fois), false = toutes les œuvres de l''artiste d''un coup.';
