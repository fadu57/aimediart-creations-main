-- ============================================================================
-- ARCHIVÉ (AIM-173) — superseded par supabase/migrations/20260101000000_baseline_schema.sql
-- Ce fichier est conservé pour l'historique uniquement. Ne JAMAIS le rejouer :
-- son contenu est capturé dans la baseline unique ci-dessus.
-- ============================================================================

-- Migration 41 : RPC soft_delete_team_member (corbeille membre équipe, admin org role 4)
-- Corrige l'erreur RLS « new row violates row-level security policy for table profiles ».
-- Exécuter : supabase/sql/soft_delete_team_member.sql (fichier complet)
