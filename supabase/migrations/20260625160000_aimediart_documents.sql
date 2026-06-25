-- 20260625160000_aimediart_documents.sql
-- Documents internes AIMEDIArt (Légal / BP / Marketing) téléversables depuis
-- la page « Contrôle IA ». Réservé aux admins globaux role_id 1-3
-- (admin_general, super_admin, developpeur).

-- ---------------------------------------------------------------------------
-- 1. Helper : admin AIMEDIArt (role_id 1, 2 ou 3, via JWT app_metadata ou auth.users)
-- ---------------------------------------------------------------------------
create or replace function public.is_aimediart_admin()
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
  ) in (1, 2, 3);
$$;

comment on function public.is_aimediart_admin() is
  'True si l''utilisateur connecté a role_id 1, 2 ou 3 (admins globaux SaaS).';

-- ---------------------------------------------------------------------------
-- 2. Table public.aimediart_documents (métadonnées des documents internes)
-- ---------------------------------------------------------------------------
create table if not exists public.aimediart_documents (
  id          uuid primary key default gen_random_uuid(),
  category    text not null
                check (category in ('legal_inpi', 'legal_societe', 'bp', 'marketing')),
  bucket      text not null,
  path        text not null,
  name        text not null,
  size_bytes  bigint,
  mime_type   text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

create index if not exists aimediart_documents_category_idx
  on public.aimediart_documents (category, created_at desc);

comment on table public.aimediart_documents is
  'Documents internes AIMEDIArt (Légal/INPI/Société, BP, Marketing) — admins globaux uniquement.';

alter table public.aimediart_documents enable row level security;

drop policy if exists "aimediart_documents_select_admin" on public.aimediart_documents;
create policy "aimediart_documents_select_admin"
  on public.aimediart_documents for select
  to authenticated
  using (public.is_aimediart_admin());

drop policy if exists "aimediart_documents_insert_admin" on public.aimediart_documents;
create policy "aimediart_documents_insert_admin"
  on public.aimediart_documents for insert
  to authenticated
  with check (public.is_aimediart_admin());

drop policy if exists "aimediart_documents_update_admin" on public.aimediart_documents;
create policy "aimediart_documents_update_admin"
  on public.aimediart_documents for update
  to authenticated
  using (public.is_aimediart_admin())
  with check (public.is_aimediart_admin());

drop policy if exists "aimediart_documents_delete_admin" on public.aimediart_documents;
create policy "aimediart_documents_delete_admin"
  on public.aimediart_documents for delete
  to authenticated
  using (public.is_aimediart_admin());

-- ---------------------------------------------------------------------------
-- 3. Buckets privés (1 par axe). Légal contient les dossiers inpi/ et societe/.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('aimediart-legal',     'aimediart-legal',     false, 26214400, null),
  ('aimediart-bp',        'aimediart-bp',        false, 26214400, null),
  ('aimediart-marketing', 'aimediart-marketing', false, 26214400, null)
on conflict (id) do nothing;

-- RLS storage.objects : lecture / écriture / suppression réservées aux admins AIMEDIArt
drop policy if exists "aimediart_docs_select" on storage.objects;
create policy "aimediart_docs_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('aimediart-legal', 'aimediart-bp', 'aimediart-marketing')
    and public.is_aimediart_admin()
  );

drop policy if exists "aimediart_docs_insert" on storage.objects;
create policy "aimediart_docs_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('aimediart-legal', 'aimediart-bp', 'aimediart-marketing')
    and public.is_aimediart_admin()
  );

drop policy if exists "aimediart_docs_update" on storage.objects;
create policy "aimediart_docs_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('aimediart-legal', 'aimediart-bp', 'aimediart-marketing')
    and public.is_aimediart_admin()
  );

drop policy if exists "aimediart_docs_delete" on storage.objects;
create policy "aimediart_docs_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('aimediart-legal', 'aimediart-bp', 'aimediart-marketing')
    and public.is_aimediart_admin()
  );
