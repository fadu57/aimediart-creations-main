-- =============================================================================
-- 20260730130000_audio_files_visitor_anon_select_grant.sql
-- =============================================================================
--
-- Le GRANT SELECT ON public.audio_files_visitor TO anon (introduit par l'ex-
-- migration legacy 20260727140000_audio_files_anon_hardening, repliée dans la
-- baseline AIM-173) n'a pas été capturé par le dump de la baseline : pg_dump
-- n'émet pas un GRANT qui coïncide avec les default privileges du schéma, mais
-- une base rejouée à froid (CI, dev local) n'hérite pas ces default
-- privileges de la même façon qu'un projet Supabase déjà provisionné — d'où
-- l'échec "permission denied for view audio_files_visitor" du test
-- tenant-isolation sur une base fraîche.
--
-- =============================================================================

BEGIN;

GRANT SELECT ON public.audio_files_visitor TO anon;

COMMIT;
