-- 20260625130000_cost_documents_any_event.sql
-- Permettre aux admins coûts (role_id 1-2) d'attacher des pièces jointes
-- (metadata.documents) à N'IMPORTE QUEL coût, y compris les coûts automatiques
-- (OVH, Supabase, événements IA…), pas seulement les saisies manuelles.

-- Politique UPDATE large pour les admins coûts : autorise la mise à jour
-- de toute ligne ai_usage_events (sert à enregistrer metadata.documents).
-- L'ancienne policy "manual_admin" reste en place pour les saisies manuelles.
drop policy if exists "ai_usage_events_update_admin_all" on public.ai_usage_events;
create policy "ai_usage_events_update_admin_all"
  on public.ai_usage_events for update
  to authenticated
  using (public.is_cost_admin())
  with check (public.is_cost_admin());
