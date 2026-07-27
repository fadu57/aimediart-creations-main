-- =============================================================================
-- 20260727120000_audio_files_anon_select_ready.sql
-- À exécuter dans Supabase → SQL Editor (tout le bloc d'un coup).
-- =============================================================================
--
-- AIM-30 — Audioguide absent pour le visiteur anonyme (VIS-AUD-01 / V12).
--
-- Cause : audio_files_select ne couvre que le rôle authenticated
--   (CREATE POLICY audio_files_select ... USING (auth.role() = 'authenticated')).
--   Le visiteur anonyme (rôle anon) est donc exclu du SELECT et obtient 0 ligne,
--   alors que le gestionnaire connecté voit bien les fichiers `ready`.
--
-- Correctif : ajouter une policy dédiée au rôle anon, restreinte aux fichiers
--   au statut `ready` (un visiteur ne doit jamais voir un fichier en génération
--   ou en erreur). La policy authenticated existante n'est pas modifiée : le
--   backoffice garde l'accès à tous les statuts pour son suivi de génération.
--
-- Hors périmètre : le mécanisme de bannissement (visitor_audio_presence.banned_at,
--   AIM-39/AIM-93) n'est PAS un garde-fou serveur sur cette policy ni sur la
--   lecture du fichier storage — vérifié (supabase/functions/visitor-audio-session
--   /index.ts) : banned_at n'est renvoyé au client que comme un simple flag
--   `banned: boolean`, à charge pour le front de cesser d'afficher/lire l'audio.
--   Un visiteur banni garde donc un accès SELECT technique intact à audio_files
--   et au fichier storage tant qu'aucune policy serveur ne consulte
--   visitor_audio_presence. Risque de sécurité résiduel connu, distinct de
--   celui traité ici — non couvert par cette policy (nécessiterait une décision
--   PM explicite sur l'ajout d'un check serveur, hors périmètre AIM-30).
--
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS audio_files_anon_select_ready ON public.audio_files;

CREATE POLICY audio_files_anon_select_ready
ON public.audio_files
FOR SELECT
TO anon
USING (status = 'ready');

COMMIT;
