-- Audit : profiles.avatar_url dont l'UUID dans photos/users/ ≠ profiles.id
-- (legacy user / artiste / users_legacy mélangés lors des migrations storage)

SELECT
  p.id AS profile_id,
  p.first_name,
  p.last_name,
  substring(p.avatar_url FROM '/photos/users/([0-9a-f-]{36})') AS path_uuid,
  p.avatar_url,
  a.artist_id,
  a.artist_photo_url
FROM public.profiles p
LEFT JOIN public.artists a
  ON lower(a.artist_firstname) = lower(coalesce(p.first_name, ''))
 AND lower(a.artist_lastname) = lower(coalesce(p.last_name, ''))
WHERE p.avatar_url LIKE '%/photos/users/%'
  AND substring(p.avatar_url FROM '/photos/users/([0-9a-f-]{36})') IS NOT NULL
  AND substring(p.avatar_url FROM '/photos/users/([0-9a-f-]{36})') <> p.id::text
ORDER BY p.last_name, p.first_name;
