-- =============================================================================
-- 20260727130000_audio_guides_storage_anon_select_ready.sql
-- À exécuter dans Supabase → SQL Editor (tout le bloc d'un coup).
-- =============================================================================
--
-- AIM-30 — Audioguide absent pour le visiteur anonyme (VIS-AUD-01 / V12).
-- Complément de 20260727120000_audio_files_anon_select_ready.sql.
--
-- Cause : audio_guides_select (storage.objects) ne couvre que le rôle
--   authenticated (CREATE POLICY audio_guides_select ... USING (bucket_id =
--   'audio-guides' AND auth.role() = 'authenticated')). getAudioUrl()
--   (src/services/audioService.ts) appelle createSignedUrl() côté client avec
--   la clé anon : sans cette policy, le visiteur anonyme voit la ligne
--   audio_files (status: ready) grâce au correctif précédent, mais se voit
--   refuser l'URL signée du fichier réel — l'audio reste inécoutable.
--
-- Correctif : policy SELECT dédiée au rôle anon sur storage.objects, limitée
--   au bucket audio-guides ET à un objet dont la ligne audio_files
--   correspondante (jointure sur storage_path = objects.name) est status =
--   'ready'. Volontairement plus stricte qu'un simple `bucket_id = ...` : un
--   visiteur ne doit jamais pouvoir lire un objet dont la génération est en
--   erreur ou en cours, même si l'objet existe déjà en storage.
--
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS audio_guides_anon_select_ready ON storage.objects;

CREATE POLICY audio_guides_anon_select_ready
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'audio-guides'
  AND EXISTS (
    SELECT 1
    FROM public.audio_files af
    WHERE af.storage_path = storage.objects.name
      AND af.status = 'ready'
  )
);

COMMIT;
