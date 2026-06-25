-- 20260625120000_manual_costs_documents.sql
-- Saisie manuelle de coûts (source='manual_entry') + documents joints (factures).
-- Réservé aux admins globaux role_id 1-2 (admin_general, super_admin).

-- ---------------------------------------------------------------------------
-- 1. Helper : admin coûts (role_id 1 ou 2, via JWT app_metadata ou auth.users)
-- ---------------------------------------------------------------------------
create or replace function public.is_cost_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    nullif(trim(auth.jwt() -> 'app_metadata' ->> 'role_id'), '')::integer,
    (
      select nullif(trim(u.raw_app_meta_data->>'role_id'), '')::integer
      from auth.users u
      where u.id = auth.uid()
    )
  ) in (1, 2);
$$;

comment on function public.is_cost_admin() is
  'True si l''utilisateur connecté a role_id 1 ou 2 (admin_general / super_admin) — saisie manuelle des coûts.';

-- ---------------------------------------------------------------------------
-- 2. ai_usage_events : autoriser MAJ / suppression des saisies manuelles (admins)
--    (l'INSERT reste couvert par la policy "authenticated" existante)
-- ---------------------------------------------------------------------------
drop policy if exists "ai_usage_events_update_manual_admin" on public.ai_usage_events;
create policy "ai_usage_events_update_manual_admin"
  on public.ai_usage_events for update
  to authenticated
  using (source = 'manual_entry' and public.is_cost_admin())
  with check (source = 'manual_entry' and public.is_cost_admin());

drop policy if exists "ai_usage_events_delete_manual_admin" on public.ai_usage_events;
create policy "ai_usage_events_delete_manual_admin"
  on public.ai_usage_events for delete
  to authenticated
  using (source = 'manual_entry' and public.is_cost_admin());

-- ---------------------------------------------------------------------------
-- 3. Bucket privé "cost-documents" (factures / justificatifs)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cost-documents',
  'cost-documents',
  false,                                   -- privé : accès via URL signée uniquement
  10485760,                                -- 10 Mo max par fichier
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do nothing;

-- RLS storage.objects : lecture / écriture / suppression réservées aux admins coûts
drop policy if exists "cost_documents_admin_select" on storage.objects;
create policy "cost_documents_admin_select"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'cost-documents' and public.is_cost_admin());

drop policy if exists "cost_documents_admin_insert" on storage.objects;
create policy "cost_documents_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cost-documents' and public.is_cost_admin());

drop policy if exists "cost_documents_admin_update" on storage.objects;
create policy "cost_documents_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'cost-documents' and public.is_cost_admin());

drop policy if exists "cost_documents_admin_delete" on storage.objects;
create policy "cost_documents_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'cost-documents' and public.is_cost_admin());
