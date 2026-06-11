-- Migration 71 : lieu de l'exposition (intérieur / extérieur)
-- true  → en intérieur
-- false → en extérieur

ALTER TABLE public.expos
  ADD COLUMN IF NOT EXISTS expo_indoor boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.expos.expo_indoor IS
  'Lieu de l''exposition pour le parcours visiteur : true = en intérieur, false = en extérieur.';
