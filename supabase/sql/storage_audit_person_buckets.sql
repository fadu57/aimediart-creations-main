-- =============================================================================
-- AUDIT STORAGE — buckets « personnes » et sous-dossiers (sous-buckets)
-- =============================================================================
-- Objectif : cartographier en profondeur artist-photos, selfies, avatars
--            avant un grand nettoyage (photos users, selfies visiteurs, avatars,
--            logos, artistes catalogue, chemins legacy, etc.)
--
-- HORS PÉrimètre (ne pas auditer ici) : artwork-images, qrcode, flags
--
-- À exécuter dans Supabase → SQL Editor (rôle postgres / service_role).
-- LECTURE SEULE — aucune modification.
--
-- Sous-buckets connus dans le code (référence) :
--   artist-photos/artists/…       → photos artistes catalogue
--   artist-photos/users/…         → photos users backoffice (cible nettoyage)
--   artist-photos/agencies/logos/ → logos organisations
--   artist-photos/expos/logos/    → logos expositions
--   artist-photos/artist/…        → legacy (migration_34 → artists/)
--   selfies/…                     → selfies visiteurs (rôle 7)
--   avatars/…                     → avatars visiteurs anonymes (sans selfie)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Rappel inventaire buckets (tous — repère visuel)
-- -----------------------------------------------------------------------------
SELECT
  b.id AS bucket_id,
  b.name AS bucket_name,
  b.public AS est_public,
  b.file_size_limit AS limite_taille_fichier_bytes,
  CASE
    WHEN b.file_size_limit IS NULL THEN 'Aucune limite'
    ELSE pg_size_pretty(b.file_size_limit::bigint)
  END AS limite_taille_lisible,
  b.allowed_mime_types AS types_mime_autorises,
  COUNT(o.id) AS nombre_de_fichiers,
  COALESCE(SUM((o.metadata ->> 'size')::bigint), 0) AS taille_totale_bytes,
  pg_size_pretty(COALESCE(SUM((o.metadata ->> 'size')::bigint), 0)) AS taille_totale_lisible,
  b.created_at AS cree_le,
  b.updated_at AS modifie_le
FROM storage.buckets b
LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.id, b.name, b.public, b.file_size_limit, b.allowed_mime_types, b.created_at, b.updated_at
ORDER BY b.name;

-- -----------------------------------------------------------------------------
-- 1) Vue d’ensemble — buckets ciblés par le nettoyage
-- -----------------------------------------------------------------------------
WITH cible AS (
  SELECT unnest(ARRAY['artist-photos', 'selfies', 'avatars']::text[]) AS bucket_id
)
SELECT
  o.bucket_id,
  COUNT(*) AS nb_fichiers,
  pg_size_pretty(COALESCE(SUM((o.metadata ->> 'size')::bigint), 0)) AS taille_totale,
  MIN(o.created_at) AS plus_ancien,
  MAX(o.created_at) AS plus_recent
FROM storage.objects o
INNER JOIN cible c ON c.bucket_id = o.bucket_id
GROUP BY o.bucket_id
ORDER BY o.bucket_id;

-- -----------------------------------------------------------------------------
-- 2) SOUS-BUCKETS niveau 1 — premier segment de chemin (prefixe racine)
--    Ex. artist-photos → artists | users | agencies | expos | selfies | …
-- -----------------------------------------------------------------------------
WITH cible AS (
  SELECT unnest(ARRAY['artist-photos', 'selfies', 'avatars']::text[]) AS bucket_id
),
parsed AS (
  SELECT
    o.bucket_id,
    o.name AS chemin_complet,
    split_part(o.name, '/', 1) AS sous_bucket_n1,
    (o.metadata ->> 'size')::bigint AS taille_bytes,
    o.metadata ->> 'mimetype' AS mimetype,
    o.created_at
  FROM storage.objects o
  INNER JOIN cible c ON c.bucket_id = o.bucket_id
)
SELECT
  bucket_id,
  sous_bucket_n1,
  COUNT(*) AS nb_fichiers,
  pg_size_pretty(COALESCE(SUM(taille_bytes), 0)) AS taille_totale,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY bucket_id), 1) AS pct_du_bucket,
  MIN(created_at) AS plus_ancien,
  MAX(created_at) AS plus_recent
FROM parsed
GROUP BY bucket_id, sous_bucket_n1
ORDER BY bucket_id, nb_fichiers DESC;

-- -----------------------------------------------------------------------------
-- 3) SOUS-BUCKETS niveau 2 — pour artist-photos et selfies (détail)
--    Ex. users/photos | agencies/logos | expos/logos | selfies/<uuid> …
-- -----------------------------------------------------------------------------
WITH cible AS (
  SELECT unnest(ARRAY['artist-photos', 'selfies', 'avatars']::text[]) AS bucket_id
),
parsed AS (
  SELECT
    o.bucket_id,
    o.name AS chemin_complet,
    split_part(o.name, '/', 1) AS n1,
    NULLIF(split_part(o.name, '/', 2), '') AS n2,
    NULLIF(split_part(o.name, '/', 3), '') AS n3,
    (o.metadata ->> 'size')::bigint AS taille_bytes,
    o.created_at
  FROM storage.objects o
  INNER JOIN cible c ON c.bucket_id = o.bucket_id
)
SELECT
  bucket_id,
  n1 AS sous_bucket_n1,
  COALESCE(n2, '— (racine ou fichier direct)') AS sous_bucket_n2,
  COUNT(*) AS nb_fichiers,
  pg_size_pretty(COALESCE(SUM(taille_bytes), 0)) AS taille_totale,
  MIN(created_at) AS plus_ancien,
  MAX(created_at) AS plus_recent
FROM parsed
GROUP BY bucket_id, n1, n2
ORDER BY bucket_id, nb_fichiers DESC, n1, n2;

-- -----------------------------------------------------------------------------
-- 4) SOUS-BUCKETS niveau 3 — chemins profonds (users/photos, agencies/logos, …)
-- -----------------------------------------------------------------------------
WITH cible AS (
  SELECT unnest(ARRAY['artist-photos', 'selfies', 'avatars']::text[]) AS bucket_id
),
parsed AS (
  SELECT
    o.bucket_id,
    o.name AS chemin_complet,
    split_part(o.name, '/', 1) AS n1,
    NULLIF(split_part(o.name, '/', 2), '') AS n2,
    NULLIF(split_part(o.name, '/', 3), '') AS n3,
    (o.metadata ->> 'size')::bigint AS taille_bytes
  FROM storage.objects o
  INNER JOIN cible c ON c.bucket_id = o.bucket_id
  WHERE o.name LIKE '%/%/%'  -- au moins 3 segments
)
SELECT
  bucket_id,
  n1 || COALESCE('/' || n2, '') || COALESCE('/' || n3, '') AS prefixe_3_niveaux,
  COUNT(*) AS nb_fichiers,
  pg_size_pretty(COALESCE(SUM(taille_bytes), 0)) AS taille_totale
FROM parsed
GROUP BY bucket_id, n1, n2, n3
ORDER BY bucket_id, nb_fichiers DESC;

-- -----------------------------------------------------------------------------
-- 5) Classification automatique — « à quoi ça ressemble ? »
--    (heuristiques sur le chemin — à valider manuellement)
-- -----------------------------------------------------------------------------
WITH cible AS (
  SELECT unnest(ARRAY['artist-photos', 'selfies', 'avatars']::text[]) AS bucket_id
),
fichiers AS (
  SELECT
    o.bucket_id,
    o.name AS chemin,
    lower(regexp_replace(o.name, '.*\.', '')) AS extension,
    (o.metadata ->> 'size')::bigint AS taille_bytes,
    o.created_at,
    CASE
      WHEN o.bucket_id = 'avatars' THEN 'AVATAR visiteur anonyme (cible)'
      WHEN o.name ~ '^artists/' THEN 'ARTISTE catalogue'
      WHEN o.name ~ '^artist/' THEN 'ARTISTE legacy (artist/ → à migrer)'
      WHEN o.name ~ '^users/' THEN 'USER backoffice (photo profil)'
      WHEN o.name ~ '^agencies/logos/' THEN 'LOGO organisation'
      WHEN o.name ~ '^expos/logos/' THEN 'LOGO exposition'
      WHEN o.bucket_id = 'selfies' AND o.name ~ '^selfies/' THEN 'SELFIE visiteur (double préfixe selfies/selfies/)'
      WHEN o.bucket_id = 'selfies' AND o.name ~ '/avatar\.' THEN 'AVATAR/photo user dans mauvais bucket (selfies)'
      WHEN o.bucket_id = 'selfies' THEN 'SELFIE visiteur (racine ou autre)'
      WHEN o.name ~* 'logo' THEN 'LOGO (autre chemin)'
      WHEN o.name ~* 'avatar' THEN 'AVATAR (autre chemin)'
      WHEN o.name ~* 'selfie' THEN 'SELFIE (autre chemin)'
      WHEN o.name ~* 'photo' THEN 'PHOTO (autre chemin)'
      WHEN o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' THEN 'Fichier UUID à la racine (anomalie ?)'
      ELSE 'AUTRE / non classé'
    END AS classification
  FROM storage.objects o
  INNER JOIN cible c ON c.bucket_id = o.bucket_id
)
SELECT
  bucket_id,
  classification,
  COUNT(*) AS nb_fichiers,
  pg_size_pretty(COALESCE(SUM(taille_bytes), 0)) AS taille_totale,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY bucket_id), 0), 1) AS pct_du_bucket
FROM fichiers
GROUP BY bucket_id, classification
ORDER BY bucket_id, nb_fichiers DESC;

-- -----------------------------------------------------------------------------
-- 6) Extensions par bucket et sous-bucket n1
-- -----------------------------------------------------------------------------
WITH cible AS (
  SELECT unnest(ARRAY['artist-photos', 'selfies', 'avatars']::text[]) AS bucket_id
)
SELECT
  o.bucket_id,
  split_part(o.name, '/', 1) AS sous_bucket_n1,
  lower(
    CASE
      WHEN o.name ~ '\.' THEN regexp_replace(o.name, '^.*\.', '')
      ELSE '(sans extension)'
    END
  ) AS extension,
  COUNT(*) AS nb_fichiers,
  pg_size_pretty(COALESCE(SUM((o.metadata ->> 'size')::bigint), 0)) AS taille_totale
FROM storage.objects o
INNER JOIN cible c ON c.bucket_id = o.bucket_id
GROUP BY o.bucket_id, split_part(o.name, '/', 1), 3
ORDER BY o.bucket_id, sous_bucket_n1, nb_fichiers DESC;

-- -----------------------------------------------------------------------------
-- 7) Anomalies — profondeur de chemin, fichiers sans extension, chemins legacy
-- -----------------------------------------------------------------------------
WITH cible AS (
  SELECT unnest(ARRAY['artist-photos', 'selfies', 'avatars']::text[]) AS bucket_id
),
parsed AS (
  SELECT
    o.bucket_id,
    o.name,
    array_length(string_to_array(o.name, '/'), 1) AS profondeur,
    (o.metadata ->> 'size')::bigint AS taille_bytes,
    o.created_at
  FROM storage.objects o
  INNER JOIN cible c ON c.bucket_id = o.bucket_id
)
SELECT
  'profondeur' AS type_anomalie,
  bucket_id,
  profondeur::text AS detail,
  COUNT(*) AS nb,
  pg_size_pretty(COALESCE(SUM(taille_bytes), 0)) AS taille
FROM parsed
GROUP BY bucket_id, profondeur

UNION ALL

SELECT
  'legacy artist/' AS type_anomalie,
  bucket_id,
  'préfixe artist/' AS detail,
  COUNT(*),
  pg_size_pretty(COALESCE(SUM(taille_bytes), 0))
FROM parsed
WHERE bucket_id = 'artist-photos' AND name ~ '^artist/'
GROUP BY bucket_id

UNION ALL

SELECT
  'double selfies' AS type_anomalie,
  bucket_id,
  'selfies/selfies/' AS detail,
  COUNT(*),
  pg_size_pretty(COALESCE(SUM(taille_bytes), 0))
FROM parsed
WHERE bucket_id = 'selfies' AND name ~ '^selfies/'
GROUP BY bucket_id

UNION ALL

SELECT
  'users dans selfies' AS type_anomalie,
  bucket_id,
  'users/' AS detail,
  COUNT(*),
  pg_size_pretty(COALESCE(SUM(taille_bytes), 0))
FROM parsed
WHERE bucket_id = 'selfies' AND name ~ '^users/'
GROUP BY bucket_id

UNION ALL

SELECT
  'sans extension' AS type_anomalie,
  bucket_id,
  name AS detail,
  1,
  pg_size_pretty(taille_bytes)
FROM parsed
WHERE name !~ '\.'

ORDER BY type_anomalie, bucket_id, nb DESC NULLS LAST;

-- -----------------------------------------------------------------------------
-- 8) Inventaire complet — liste de tous les fichiers (export / tri manuel)
-- -----------------------------------------------------------------------------
SELECT
  o.bucket_id,
  o.name AS chemin_complet,
  split_part(o.name, '/', 1) AS n1,
  split_part(o.name, '/', 2) AS n2,
  split_part(o.name, '/', 3) AS n3,
  pg_size_pretty(COALESCE((o.metadata ->> 'size')::bigint, 0)) AS taille,
  o.metadata ->> 'mimetype' AS mimetype,
  o.created_at,
  o.updated_at
FROM storage.objects o
WHERE o.bucket_id IN ('artist-photos', 'selfies', 'avatars')
ORDER BY o.bucket_id, o.name;

-- -----------------------------------------------------------------------------
-- 9) Croisement BASE ↔ STORAGE — URLs en base qui pointent vers ces buckets
-- -----------------------------------------------------------------------------

-- 9a) profiles.avatar_url (users backoffice)
SELECT
  'profiles.avatar_url' AS source_table,
  CASE
    WHEN p.avatar_url LIKE '%/artist-photos/%' THEN 'artist-photos'
    WHEN p.avatar_url LIKE '%/selfies/%' THEN 'selfies (⚠ user dans bucket visiteur)'
    WHEN p.avatar_url LIKE '%/avatars/%' THEN 'avatars'
    ELSE 'autre / externe'
  END AS bucket_detecte,
  CASE
    WHEN p.avatar_url ~ '/artist-photos/users/' THEN 'users/…'
    WHEN p.avatar_url ~ '/artist-photos/artists/' THEN 'artists/… (⚠ confondu artiste?)'
    WHEN p.avatar_url ~ '/artist-photos/agencies/' THEN 'agencies/logos/…'
    WHEN p.avatar_url ~ '/selfies/users/' THEN 'selfies/users/… (legacy code)'
    WHEN p.avatar_url ~ '/selfies/selfies/' THEN 'selfies/selfies/… (double préfixe)'
    ELSE regexp_replace(
      substring(p.avatar_url from '/object/public/[^/]+/(.+)$'),
      '[^/]+$', '…'
    )
  END AS sous_bucket_detecte,
  COUNT(*) AS nb_profils,
  COUNT(*) FILTER (WHERE p.avatar_url IS NOT NULL AND trim(p.avatar_url) <> '') AS avec_url
FROM public.profiles p
GROUP BY 1, 2, 3
HAVING COUNT(*) FILTER (WHERE p.avatar_url IS NOT NULL AND trim(p.avatar_url) <> '') > 0
ORDER BY nb_profils DESC;

-- 9b) Détail profils avec photo — bucket et chemin
SELECT
  p.id AS user_id,
  p.first_name,
  p.last_name,
  p.avatar_url,
  CASE
    WHEN p.avatar_url LIKE '%/artist-photos/%' THEN 'artist-photos'
    WHEN p.avatar_url LIKE '%/selfies/%' THEN 'selfies'
    WHEN p.avatar_url LIKE '%/avatars/%' THEN 'avatars'
    ELSE '?'
  END AS bucket,
  substring(p.avatar_url from '/object/public/[^/]+/(.+)$') AS chemin_storage
FROM public.profiles p
WHERE p.avatar_url IS NOT NULL AND trim(p.avatar_url) <> ''
ORDER BY bucket, chemin_storage;

-- 9c) auth.users — metadata visiteurs (user_photo_url, avatar_url)
SELECT
  'auth.users metadata' AS source,
  CASE
    WHEN COALESCE(u.raw_user_meta_data ->> 'user_photo_url', '') LIKE '%/selfies/%' THEN 'selfies'
    WHEN COALESCE(u.raw_user_meta_data ->> 'user_photo_url', '') LIKE '%/avatars/%' THEN 'avatars'
    WHEN COALESCE(u.raw_user_meta_data ->> 'user_photo_url', '') LIKE '%/artist-photos/%' THEN 'artist-photos'
    WHEN COALESCE(u.raw_user_meta_data ->> 'avatar_url', '') LIKE '%/selfies/%' THEN 'selfies'
    WHEN COALESCE(u.raw_user_meta_data ->> 'avatar_url', '') LIKE '%/avatars/%' THEN 'avatars'
    WHEN COALESCE(u.raw_user_meta_data ->> 'avatar_url', '') LIKE '%/artist-photos/%' THEN 'artist-photos'
    ELSE 'autre / vide'
  END AS bucket_photo,
  COUNT(*) AS nb_users
FROM auth.users u
WHERE NULLIF(trim(COALESCE(u.raw_user_meta_data ->> 'user_photo_url', '')), '') IS NOT NULL
   OR NULLIF(trim(COALESCE(u.raw_user_meta_data ->> 'avatar_url', '')), '') IS NOT NULL
GROUP BY 1, 2
ORDER BY nb_users DESC;

-- 9d) Fichiers storage ORPHELINS — présents en bucket, absents des URLs connues en base
WITH urls_base AS (
  SELECT trim(avatar_url) AS url
  FROM public.profiles
  WHERE avatar_url IS NOT NULL AND trim(avatar_url) <> ''
  UNION
  SELECT trim(logo_agency) FROM public.agencies WHERE logo_agency IS NOT NULL AND trim(logo_agency) <> ''
  UNION
  SELECT trim(artist_photo_url) FROM public.artists WHERE artist_photo_url IS NOT NULL AND trim(artist_photo_url) <> ''
  UNION
  SELECT trim(COALESCE(u.raw_user_meta_data ->> 'user_photo_url', ''))
  FROM auth.users u
  WHERE NULLIF(trim(COALESCE(u.raw_user_meta_data ->> 'user_photo_url', '')), '') IS NOT NULL
  UNION
  SELECT trim(COALESCE(u.raw_user_meta_data ->> 'avatar_url', ''))
  FROM auth.users u
  WHERE NULLIF(trim(COALESCE(u.raw_user_meta_data ->> 'avatar_url', '')), '') IS NOT NULL
),
chemins_references AS (
  SELECT DISTINCT substring(url from '/object/public/[^/]+/(.+)$') AS chemin
  FROM urls_base
  WHERE url ~ '/object/public/'
),
fichiers AS (
  SELECT o.bucket_id, o.name AS chemin
  FROM storage.objects o
  WHERE o.bucket_id IN ('artist-photos', 'selfies', 'avatars')
)
SELECT
  f.bucket_id,
  f.chemin,
  CASE
    WHEN cr.chemin IS NULL THEN 'ORPHELIN (aucune URL en base)'
    ELSE 'référencé en base'
  END AS statut
FROM fichiers f
LEFT JOIN chemins_references cr ON cr.chemin = f.chemin
ORDER BY statut DESC, f.bucket_id, f.chemin;

-- -----------------------------------------------------------------------------
-- 10) Synthèse « sous-buckets » recommandés après nettoyage (référence cible)
-- -----------------------------------------------------------------------------
SELECT *
FROM (
  VALUES
    ('artist-photos', 'artists', 'Photos artistes catalogue', 'Conserver — hors nettoyage personnes'),
    ('artist-photos', 'users', 'Photos users backoffice (rôles 1–6)', 'Cible canonique : users/{user_id}.webp'),
    ('artist-photos', 'agencies/logos', 'Logos organisations', 'Conserver — hors nettoyage personnes'),
    ('artist-photos', 'expos/logos', 'Logos expositions', 'Conserver — hors nettoyage personnes'),
    ('selfies', '(racine)', 'Selfies visiteurs rôle 7', 'Cible canonique : {user_id}.webp'),
    ('avatars', '(racine)', 'Avatars visiteurs anonymes', 'Cible canonique : {user_id}.webp (max 500 kB)')
) AS t(bucket, sous_bucket, role_metier, note)
ORDER BY bucket, sous_bucket;

-- =============================================================================
-- FIN — Copier les résultats des sections 2, 5, 7 et 9 pour le plan de migration
-- =============================================================================
