-- migration_34_storage_artist_to_artists.sql
-- Déplace les objets Storage artist-photos/artist/… → artist-photos/artists/…
-- puis met à jour les URLs en base et supprime tout résidu sous artist/.
--
-- À exécuter dans Supabase → SQL Editor (rôle postgres / service).
-- Faire une sauvegarde ou lancer d’abord les SELECT de contrôle (section 0).
--
-- Après migration réussie, vous pouvez retirer le préfixe artist/ des policies
-- (migration_33) si vous n’en avez plus besoin.

-- =============================================================================
-- 0) CONTRÔLES (lecture seule — exécuter avant le BEGIN)
-- =============================================================================

-- Fichiers concernés dans Storage
-- SELECT id, name, created_at
-- FROM storage.objects
-- WHERE bucket_id = 'artist-photos'
--   AND name ~ '^artist/'
-- ORDER BY name;

-- Conflits potentiels (cible artists/… déjà occupée)
-- SELECT
--   o.name AS chemin_actuel,
--   regexp_replace(o.name, '^artist/', 'artists/') AS chemin_cible,
--   e.name AS deja_present
-- FROM storage.objects o
-- JOIN storage.objects e
--   ON e.bucket_id = 'artist-photos'
--  AND e.name = regexp_replace(o.name, '^artist/', 'artists/')
-- WHERE o.bucket_id = 'artist-photos'
--   AND o.name ~ '^artist/';

-- URLs en base pointant encore vers /artist-photos/artist/
-- SELECT artist_id, artist_photo_url
-- FROM public.artists
-- WHERE artist_photo_url IS NOT NULL
--   AND artist_photo_url LIKE '%/artist-photos/artist/%';

-- =============================================================================
-- 1) MIGRATION
-- =============================================================================

BEGIN;

-- 1a) Renommer les objets Storage (sans écraser une cible existante)
WITH to_move AS (
  SELECT
    id,
    name,
    regexp_replace(name, '^artist/', 'artists/') AS new_name
  FROM storage.objects
  WHERE bucket_id = 'artist-photos'
    AND name ~ '^artist/'
),
blocked AS (
  SELECT tm.id
  FROM to_move tm
  INNER JOIN storage.objects existing
    ON existing.bucket_id = 'artist-photos'
   AND existing.name = tm.new_name
)
UPDATE storage.objects AS o
SET name = tm.new_name
FROM to_move tm
WHERE o.id = tm.id
  AND o.id NOT IN (SELECT id FROM blocked);

-- 1b) path_tokens est une colonne GENERATED sur storage.objects : ne pas la
--     modifier (elle suit automatiquement le champ name).

-- 1c) URLs publiques dans public.artists (colonne réelle : artist_photo_url)
UPDATE public.artists
SET artist_photo_url = REPLACE(artist_photo_url, '/artist-photos/artist/', '/artist-photos/artists/')
WHERE artist_photo_url IS NOT NULL
  AND artist_photo_url LIKE '%/artist-photos/artist/%';

-- 1d) Supprimer tout objet restant sous artist/ (dossier virtuel vide ensuite)
DELETE FROM storage.objects
WHERE bucket_id = 'artist-photos'
  AND name ~ '^artist/';

COMMIT;

-- =============================================================================
-- 2) VÉRIFICATIONS POST-MIGRATION
-- =============================================================================

-- SELECT count(*) AS reste_sous_artist
-- FROM storage.objects
-- WHERE bucket_id = 'artist-photos' AND name ~ '^artist/';
-- → doit retourner 0

-- SELECT count(*) AS sous_artists
-- FROM storage.objects
-- WHERE bucket_id = 'artist-photos' AND name ~ '^artists/';

-- Objets non migrés (conflit) — à traiter à la main si > 0 :
-- WITH to_move AS (
--   SELECT o.id, o.name, regexp_replace(o.name, '^artist/', 'artists/') AS new_name
--   FROM storage.objects o
--   WHERE o.bucket_id = 'artist-photos' AND o.name ~ '^artist/'
-- )
-- SELECT tm.*
-- FROM to_move tm
-- JOIN storage.objects e ON e.bucket_id = 'artist-photos' AND e.name = tm.new_name;
