-- Migration 39 : met à jour les URLs en base après copie storage (logos / photos)
-- PRUDENT : ne supprime aucun objet storage.
-- À exécuter UNIQUEMENT après :
--   1) migration_38 (buckets + RLS)
--   2) scripts/migrate_storage_logos_photos.py --execute
--
-- Les REPLACE ci-dessous supposent la même racine Supabase (/object/public/).
-- Faire un SELECT de contrôle avant COMMIT.

BEGIN;

-- -----------------------------------------------------------------------------
-- 0) CONTRÔLES (décommenter avant migration)
-- -----------------------------------------------------------------------------
-- SELECT id, avatar_url FROM public.profiles WHERE avatar_url LIKE '%artist-photos%' LIMIT 20;
-- SELECT artist_id, artist_photo_url FROM public.artists WHERE artist_photo_url LIKE '%artist-photos%' LIMIT 20;

-- -----------------------------------------------------------------------------
-- 1) public.profiles — photos users
-- -----------------------------------------------------------------------------
UPDATE public.profiles
SET avatar_url = REPLACE(avatar_url, '/artist-photos/users/photos/', '/photos/users/')
WHERE avatar_url LIKE '%/artist-photos/users/photos/%';

UPDATE public.profiles
SET avatar_url = REPLACE(avatar_url, '/artist-photos/users/', '/photos/users/')
WHERE avatar_url LIKE '%/artist-photos/users/%';

UPDATE public.profiles
SET avatar_url = REPLACE(avatar_url, '/selfies/users/photos/', '/photos/users/')
WHERE avatar_url LIKE '%/selfies/users/photos/%';

UPDATE public.profiles
SET avatar_url = REPLACE(avatar_url, '/selfies/', '/photos/visitors/')
WHERE avatar_url LIKE '%/selfies/%'
  AND avatar_url NOT LIKE '%/photos/%';

-- -----------------------------------------------------------------------------
-- 2) public.artists — catalogue
-- -----------------------------------------------------------------------------
UPDATE public.artists
SET artist_photo_url = REPLACE(artist_photo_url, '/artist-photos/artist/', '/photos/artists/')
WHERE artist_photo_url LIKE '%/artist-photos/artist/%';

UPDATE public.artists
SET artist_photo_url = REPLACE(artist_photo_url, '/artist-photos/artists/', '/photos/artists/')
WHERE artist_photo_url LIKE '%/artist-photos/artists/%';

-- -----------------------------------------------------------------------------
-- 3) public.agencies — logos
-- -----------------------------------------------------------------------------
UPDATE public.agencies
SET logo_agency = REPLACE(logo_agency, '/artist-photos/agencies/logos/', '/logos/agencies/')
WHERE logo_agency LIKE '%/artist-photos/agencies/logos/%';

-- -----------------------------------------------------------------------------
-- 4) public.expos — logos (colonnes possibles)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expos' AND column_name = 'logo_expo'
  ) THEN
    UPDATE public.expos
    SET logo_expo = REPLACE(logo_expo, '/artist-photos/expos/logos/', '/logos/expos/')
    WHERE logo_expo LIKE '%/artist-photos/expos/logos/%';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5) auth.users — metadata visiteurs (service role / postgres uniquement)
-- -----------------------------------------------------------------------------
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{user_photo_url}',
  to_jsonb(
    REPLACE(
      COALESCE(raw_user_meta_data ->> 'user_photo_url', ''),
      '/selfies/',
      '/photos/visitors/'
    )
  ),
  true
)
WHERE COALESCE(raw_user_meta_data ->> 'user_photo_url', '') LIKE '%/selfies/%';

UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{avatar_url}',
  to_jsonb(
    REPLACE(
      COALESCE(raw_user_meta_data ->> 'avatar_url', ''),
      '/avatars/',
      '/photos/avatars/'
    )
  ),
  true
)
WHERE COALESCE(raw_user_meta_data ->> 'avatar_url', '') LIKE '%/avatars/%';

UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{user_photo_url}',
  to_jsonb(
    REPLACE(
      COALESCE(raw_user_meta_data ->> 'user_photo_url', ''),
      '/artist-photos/users/',
      '/photos/users/'
    )
  ),
  true
)
WHERE COALESCE(raw_user_meta_data ->> 'user_photo_url', '') LIKE '%/artist-photos/users/%';

COMMIT;

-- -----------------------------------------------------------------------------
-- 6) Vérification post-migration
-- -----------------------------------------------------------------------------
-- SELECT COUNT(*) FROM public.profiles WHERE avatar_url LIKE '%/photos/users/%';
-- SELECT COUNT(*) FROM public.profiles WHERE avatar_url LIKE '%/artist-photos/%';
-- SELECT COUNT(*) FROM public.artists WHERE artist_photo_url LIKE '%/photos/artists/%';
