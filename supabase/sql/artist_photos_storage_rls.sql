-- Policies Storage pour le bucket artist-photos (upload photos artistes).
-- Chemin canonique : artists/… — artist/… conservé en lecture pour fichiers créés par erreur.

BEGIN;

DROP POLICY IF EXISTS "artist_photos_public_read" ON storage.objects;
CREATE POLICY "artist_photos_public_read"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'artist-photos'
  AND (name LIKE 'artist/%' OR name LIKE 'artists/%')
);

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
