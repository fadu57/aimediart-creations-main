-- Lecture publique des avatars générés (pool pseudo adjectif_nom.jpg).
-- Permet à review-avatars.html de lister le bucket sans 2 500 requêtes HEAD.
-- À exécuter dans Supabase → SQL Editor.

BEGIN;

DROP POLICY IF EXISTS "avatars_pool_public_read" ON storage.objects;
CREATE POLICY "avatars_pool_public_read"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'avatars'
  AND name ~ '^[a-z0-9]+_[a-z0-9]+\.jpg$'
);

COMMIT;
