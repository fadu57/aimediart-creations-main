-- =============================================================================
-- migration_26_supabase_linter_remaining_warnings.sql
-- À relire puis exécuter dans Supabase (SQL Editor) par SECTIONS si besoin.
-- =============================================================================
--
-- Couvre les derniers WARN du linter souvent encore présents après migrations
-- RLS / users :
--   0014 extension_in_public (unaccent)
--   0025 public_bucket_allows_listing (storage.objects)
--   auth_leaked_password_protection → DASHBOARD uniquement (voir fin)
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION A — Lint 0014 : déplacer unaccent hors du schéma public
-- ---------------------------------------------------------------------------
-- Risque : tout objet SQL qui référence encore unaccent en « public » peut casser.
-- Vérifiez les vues / fonctions : \df+ unaccent ou recherche dans vos migrations.
--
-- Décommentez pour appliquer :
--
-- CREATE SCHEMA IF NOT EXISTS extensions;
-- ALTER EXTENSION unaccent SET SCHEMA extensions;
--
-- Si des fonctions utilisent encore public.unaccent(...), mettez à jour leur corps
-- ou qualifiez : extensions.unaccent(...)

-- ---------------------------------------------------------------------------
-- SECTION B — Lint 0025 : réduire le « listing » sur buckets publics
-- ---------------------------------------------------------------------------
-- Le linter signale une policy SELECT trop large : n’importe quel client peut
-- LISTER tous les objets du bucket. Les URLs publiques d’un fichier précis
-- restent utilisables ; on restreint la lecture à des préfixes de chemins.
--
-- Préfixes alignés sur l’app (voir ArtworkModal, etc.) :
--   - artwork-images : chemins sous artworks/...
--   - qrcode          : chemins sous qrcodes/...
--
-- Exécutez dans SQL Editor (rôle suffisant sur storage).

BEGIN;

-- Bucket artwork-images
DROP POLICY IF EXISTS "artwork_images_public_read" ON storage.objects;

CREATE POLICY "artwork_images_public_read"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'artwork-images'
  AND name LIKE 'artworks/%'
);

-- Bucket qrcode : l’ancienne policy « Admin peut uploader des qrcodes » est
-- souvent trop large en SELECT (listing). On la supprime puis on sépare
-- lecture publique (préfixe) et écriture authentifiée (upload / upsert).
DROP POLICY IF EXISTS "Admin peut uploader des qrcodes" ON storage.objects;
DROP POLICY IF EXISTS "qrcode_public_read_prefix" ON storage.objects;
DROP POLICY IF EXISTS "qrcode_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "qrcode_authenticated_update" ON storage.objects;

CREATE POLICY "qrcode_public_read_prefix"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'qrcode'
  AND name LIKE 'qrcodes/%'
);

-- Upload depuis l’app (utilisateur connecté) — chemins qrcodes/... (voir ArtworkModal)
CREATE POLICY "qrcode_authenticated_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'qrcode'
  AND name LIKE 'qrcodes/%'
);

CREATE POLICY "qrcode_authenticated_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'qrcode'
  AND name LIKE 'qrcodes/%'
)
WITH CHECK (
  bucket_id = 'qrcode'
  AND name LIKE 'qrcodes/%'
);

COMMIT;

-- Si l’upload d’images d’œuvre échoue après la section artwork-images : ajoutez
-- des policies INSERT (authenticated) sur storage.objects pour bucket_id =
-- 'artwork-images' et chemins artworks/... (le linter ne concernait que le SELECT).

-- ---------------------------------------------------------------------------
-- SECTION C — auth_leaked_password_protection (PAS de SQL)
-- ---------------------------------------------------------------------------
-- Dashboard Supabase → Authentication → Policies (ou Settings selon UI)
-- → activer la protection contre les mots de passe compromis (HaveIBeenPwned).
--
-- =============================================================================
