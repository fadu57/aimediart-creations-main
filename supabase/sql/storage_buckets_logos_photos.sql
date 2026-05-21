-- Migration 38 : nouveaux buckets logos + photos (PRUDENT — ne supprime rien)
-- Copie de supabase/sql/storage_buckets_logos_photos.sql
--
-- Étape 1 du grand nettoyage storage :
--   1) Exécuter CE script (crée buckets + RLS)
--   2) Lancer scripts/migrate_storage_logos_photos.py --dry-run puis sans --dry-run
--   3) Exécuter migration_39_storage_urls_logos_photos.sql
--   4) Déployer le code (uploads → logos / photos)
-- Les anciens buckets (artist-photos, selfies, avatars) restent en lecture.

BEGIN;

-- -----------------------------------------------------------------------------
-- Buckets publics
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('logos', 'logos', true, NULL, NULL),
  ('photos', 'photos', true, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  updated_at = now();

-- -----------------------------------------------------------------------------
-- Helper : chemin photos/{prefix}{user_id}.ext appartient à l'utilisateur courant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storage_photos_path_is_own(p_prefix text, p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_name LIKE p_prefix || auth.uid()::text || '.%';
$$;

COMMENT ON FUNCTION public.storage_photos_path_is_own(text, text) IS
  'Vrai si object name = {prefix}{auth.uid()}.{ext} (ex. users/uuid.webp).';

GRANT EXECUTE ON FUNCTION public.storage_photos_path_is_own(text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- LOGOS — lecture publique, écriture staff
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "logos_public_read" ON storage.objects;
CREATE POLICY "logos_public_read"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'logos'
  AND (name LIKE 'agencies/%' OR name LIKE 'expos/%')
);

DROP POLICY IF EXISTS "logos_staff_insert" ON storage.objects;
CREATE POLICY "logos_staff_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logos'
  AND (name LIKE 'agencies/%' OR name LIKE 'expos/%')
  AND public.rls_is_staff()
);

DROP POLICY IF EXISTS "logos_staff_update" ON storage.objects;
CREATE POLICY "logos_staff_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'logos'
  AND (name LIKE 'agencies/%' OR name LIKE 'expos/%')
  AND public.rls_is_staff()
)
WITH CHECK (
  bucket_id = 'logos'
  AND (name LIKE 'agencies/%' OR name LIKE 'expos/%')
  AND public.rls_is_staff()
);

DROP POLICY IF EXISTS "logos_staff_delete" ON storage.objects;
CREATE POLICY "logos_staff_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'logos'
  AND (name LIKE 'agencies/%' OR name LIKE 'expos/%')
  AND public.rls_is_staff()
);

-- -----------------------------------------------------------------------------
-- PHOTOS — lecture publique
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "photos_public_read" ON storage.objects;
CREATE POLICY "photos_public_read"
ON storage.objects FOR SELECT TO public
USING (
  bucket_id = 'photos'
  AND (
    name LIKE 'artists/%'
    OR name LIKE 'users/%'
    OR name LIKE 'visitors/%'
    OR name LIKE 'avatars/%'
  )
);

-- Catalogue artistes : staff
DROP POLICY IF EXISTS "photos_artists_staff_insert" ON storage.objects;
CREATE POLICY "photos_artists_staff_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'photos'
  AND name LIKE 'artists/%'
  AND public.rls_is_staff()
);

DROP POLICY IF EXISTS "photos_artists_staff_update" ON storage.objects;
CREATE POLICY "photos_artists_staff_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'photos' AND name LIKE 'artists/%' AND public.rls_is_staff())
WITH CHECK (bucket_id = 'photos' AND name LIKE 'artists/%' AND public.rls_is_staff());

DROP POLICY IF EXISTS "photos_artists_staff_delete" ON storage.objects;
CREATE POLICY "photos_artists_staff_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'photos' AND name LIKE 'artists/%' AND public.rls_is_staff());

-- Users backoffice : soi-même ou staff
DROP POLICY IF EXISTS "photos_users_insert" ON storage.objects;
CREATE POLICY "photos_users_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'photos'
  AND name LIKE 'users/%'
  AND (public.storage_photos_path_is_own('users/', name) OR public.rls_is_staff())
);

DROP POLICY IF EXISTS "photos_users_update" ON storage.objects;
CREATE POLICY "photos_users_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'photos'
  AND name LIKE 'users/%'
  AND (public.storage_photos_path_is_own('users/', name) OR public.rls_is_staff())
)
WITH CHECK (
  bucket_id = 'photos'
  AND name LIKE 'users/%'
  AND (public.storage_photos_path_is_own('users/', name) OR public.rls_is_staff())
);

DROP POLICY IF EXISTS "photos_users_delete" ON storage.objects;
CREATE POLICY "photos_users_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'photos'
  AND name LIKE 'users/%'
  AND (public.storage_photos_path_is_own('users/', name) OR public.rls_is_staff())
);

-- Visiteurs (selfie) et avatars anonymes : propre fichier uniquement
DROP POLICY IF EXISTS "photos_visitors_insert" ON storage.objects;
CREATE POLICY "photos_visitors_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'photos'
  AND name LIKE 'visitors/%'
  AND public.storage_photos_path_is_own('visitors/', name)
);

DROP POLICY IF EXISTS "photos_visitors_update" ON storage.objects;
CREATE POLICY "photos_visitors_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'photos'
  AND name LIKE 'visitors/%'
  AND public.storage_photos_path_is_own('visitors/', name)
)
WITH CHECK (
  bucket_id = 'photos'
  AND name LIKE 'visitors/%'
  AND public.storage_photos_path_is_own('visitors/', name)
);

DROP POLICY IF EXISTS "photos_avatars_insert" ON storage.objects;
CREATE POLICY "photos_avatars_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'photos'
  AND name LIKE 'avatars/%'
  AND public.storage_photos_path_is_own('avatars/', name)
);

DROP POLICY IF EXISTS "photos_avatars_update" ON storage.objects;
CREATE POLICY "photos_avatars_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'photos'
  AND name LIKE 'avatars/%'
  AND public.storage_photos_path_is_own('avatars/', name)
)
WITH CHECK (
  bucket_id = 'photos'
  AND name LIKE 'avatars/%'
  AND public.storage_photos_path_is_own('avatars/', name)
);

COMMIT;
