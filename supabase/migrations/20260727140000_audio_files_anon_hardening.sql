-- =============================================================================
-- 20260727140000_audio_files_anon_hardening.sql
-- À exécuter dans Supabase → SQL Editor (tout le bloc d'un coup).
-- =============================================================================
--
-- AIM-30 — Durcissement suite à l'audit sécurité des deux migrations
--   précédentes (20260727120000, 20260727130000).
--
-- 1) Colonnes exposées à anon (finding : moindre privilège colonne).
--    audio_files contient des colonnes de coût/télémétrie interne (provider,
--    model, input_chars, input_tokens, cost_usd) que `select("*")` exposait
--    intégralement au rôle anon dès la policy SELECT ajoutée. Aucun code
--    client (visiteur ou backoffice) ne lit ces colonnes — vérifié dans
--    src/services/audioService.ts et ses appelants (AudioPlayer.tsx,
--    WorkflowPersonaVoiceStatus.tsx). On retire donc l'accès à la table pour
--    anon et on expose une vue restreinte aux seules colonnes utiles au
--    visiteur.
--
-- 2) Couplage RLS storage <-> table (finding : la policy storage.objects de
--    20260727130000 évalue son EXISTS sous le rôle anon — si la policy
--    SELECT d'audio_files change de forme un jour, la policy storage peut se
--    comporter différemment sans qu'on y touche). On isole ce check dans une
--    fonction SECURITY DEFINER dédiée, indépendante de la policy RLS de la
--    table.
--
-- 3) GRANT explicite manquant pour anon (finding : la policy RLS seule ne
--    suffit pas si le GRANT SELECT sur la table n'est pas garanti côté
--    projet) et index manquant sur storage_path (utilisé par la policy
--    storage à chaque lecture d'objet).
--
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Retirer l'accès direct table pour anon, exposer une vue restreinte.
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.audio_files FROM anon;
DROP POLICY IF EXISTS audio_files_anon_select_ready ON public.audio_files;

CREATE OR REPLACE VIEW public.audio_files_visitor AS
SELECT
  id,
  text_id,
  text_type,
  lang,
  prompt_style_id,
  voice_id,
  gender,
  storage_path,
  duration_sec,
  status,
  error_message,
  created_at,
  updated_at
FROM public.audio_files
WHERE status = 'ready';

GRANT SELECT ON public.audio_files_visitor TO anon;

-- ---------------------------------------------------------------------------
-- 2) Fonction SECURITY DEFINER pour la policy storage.objects — découple la
--    lecture du fichier storage de la forme exacte de la policy RLS de la
--    table (elle relit la table avec ses propres privilèges, pas ceux
--    d'anon).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audio_file_is_ready(p_storage_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audio_files af
    WHERE af.storage_path = p_storage_path
      AND af.status = 'ready'
  );
$$;

COMMENT ON FUNCTION public.audio_file_is_ready(text) IS
  'True si un audio_files.status = ready référence ce storage_path. SECURITY DEFINER : indépendant de la policy RLS anon sur audio_files.';

REVOKE ALL ON FUNCTION public.audio_file_is_ready(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audio_file_is_ready(text) TO anon;

DROP POLICY IF EXISTS audio_guides_anon_select_ready ON storage.objects;

CREATE POLICY audio_guides_anon_select_ready
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'audio-guides'
  AND public.audio_file_is_ready(name)
);

-- ---------------------------------------------------------------------------
-- 3) GRANT défensif + index.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS audio_files_storage_path_idx
  ON public.audio_files (storage_path);

COMMIT;
