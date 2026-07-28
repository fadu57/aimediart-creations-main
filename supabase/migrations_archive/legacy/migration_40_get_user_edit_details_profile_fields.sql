-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- Migration 40 : get_user_edit_details inclut first_name, last_name, username, phone (SECURITY DEFINER)
-- Corrige les fiches dashboard quand RLS bloque la lecture directe de profiles.
-- Exécuter : supabase/sql/get_user_edit_details.sql (fichier complet)
