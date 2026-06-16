-- Parcours visiteur anonyme (/visitor?artwork_id=...) :
-- Permet à la clé `anon` de lire l'expo_id d'une œuvre pour afficher le bloc expo
-- sur la landing visiteur après scan d'un QR-code d'œuvre.
-- À exécuter dans le SQL Editor Supabase ou via migration.

GRANT SELECT ON TABLE public.artworks TO anon;

DROP POLICY IF EXISTS "artworks_public_anon_select_active" ON public.artworks;

CREATE POLICY "artworks_public_anon_select_active"
ON public.artworks FOR SELECT TO anon
USING (
  artwork_deleted_at IS NULL
);
