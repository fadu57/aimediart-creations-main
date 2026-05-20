-- migration_33_artist_photos_storage_rls.sql
-- Corrige : « new row violates row-level security policy » à l’upload dans artist-photos.
-- À exécuter dans Supabase → SQL Editor (projet ladhkvghtnzpnqolxybb ou le vôtre).
--
-- Prérequis : fonctions public.rls_is_staff() / rls_is_global_admin() (migration rls_security_fix).
-- Chemin app canonique : artists/{uuid}.ext — le préfixe artist/ (sans s) est toléré en lecture seule (legacy).

BEGIN;

-- Bucket public en lecture (URLs getPublicUrl) — pas de listing sur tout le bucket.
DROP POLICY IF EXISTS "artist_photos_public_read" ON storage.objects;
CREATE POLICY "artist_photos_public_read"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'artist-photos'
  AND (name LIKE 'artist/%' OR name LIKE 'artists/%')
);

-- Upload / remplacement (staff connecté, rôles 1–6)
DROP POLICY IF EXISTS "artist_photos_staff_insert" ON storage.objects;
CREATE POLICY "artist_photos_staff_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'artist-photos'
  AND (name LIKE 'artist/%' OR name LIKE 'artists/%')
  AND public.rls_is_staff()
);

DROP POLICY IF EXISTS "artist_photos_staff_update" ON storage.objects;
CREATE POLICY "artist_photos_staff_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'artist-photos'
  AND (name LIKE 'artist/%' OR name LIKE 'artists/%')
  AND public.rls_is_staff()
)
WITH CHECK (
  bucket_id = 'artist-photos'
  AND (name LIKE 'artist/%' OR name LIKE 'artists/%')
  AND public.rls_is_staff()
);

-- Suppression de l’ancienne photo lors d’un remplacement
DROP POLICY IF EXISTS "artist_photos_staff_delete" ON storage.objects;
CREATE POLICY "artist_photos_staff_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'artist-photos'
  AND (name LIKE 'artist/%' OR name LIKE 'artists/%')
  AND public.rls_is_staff()
);

COMMIT;
