-- Sous-dossiers GED + lien de partage public (share_token).
-- Réservé aux admins globaux via is_aimediart_admin().

-- ---------------------------------------------------------------------------
-- 1. Table des sous-dossiers (1 niveau sous une catégorie)
-- ---------------------------------------------------------------------------
create table if not exists public.aimediart_document_folders (
  id          uuid primary key default gen_random_uuid(),
  category    text not null
                check (category in ('legal_inpi', 'legal_societe', 'bp', 'marketing')),
  name        text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  constraint aimediart_document_folders_name_nonempty
    check (length(trim(name)) > 0)
);

create unique index if not exists aimediart_document_folders_category_name_uidx
  on public.aimediart_document_folders (category, lower(trim(name)));

create index if not exists aimediart_document_folders_category_idx
  on public.aimediart_document_folders (category, created_at asc);

comment on table public.aimediart_document_folders is
  'Sous-dossiers GED AIMEDIArt (1 niveau) — admins globaux uniquement.';

alter table public.aimediart_document_folders enable row level security;

drop policy if exists "aimediart_folders_select_admin" on public.aimediart_document_folders;
create policy "aimediart_folders_select_admin"
  on public.aimediart_document_folders for select
  to authenticated
  using (public.is_aimediart_admin());

drop policy if exists "aimediart_folders_insert_admin" on public.aimediart_document_folders;
create policy "aimediart_folders_insert_admin"
  on public.aimediart_document_folders for insert
  to authenticated
  with check (public.is_aimediart_admin());

drop policy if exists "aimediart_folders_update_admin" on public.aimediart_document_folders;
create policy "aimediart_folders_update_admin"
  on public.aimediart_document_folders for update
  to authenticated
  using (public.is_aimediart_admin())
  with check (public.is_aimediart_admin());

drop policy if exists "aimediart_folders_delete_admin" on public.aimediart_document_folders;
create policy "aimediart_folders_delete_admin"
  on public.aimediart_document_folders for delete
  to authenticated
  using (public.is_aimediart_admin());

-- ---------------------------------------------------------------------------
-- 2. Rattachement documents → dossier + token de partage
-- ---------------------------------------------------------------------------
alter table public.aimediart_documents
  add column if not exists folder_id uuid
    references public.aimediart_document_folders(id) on delete restrict;

alter table public.aimediart_documents
  add column if not exists share_token uuid;

update public.aimediart_documents
set share_token = gen_random_uuid()
where share_token is null;

alter table public.aimediart_documents
  alter column share_token set default gen_random_uuid();

alter table public.aimediart_documents
  alter column share_token set not null;

create unique index if not exists aimediart_documents_share_token_uidx
  on public.aimediart_documents (share_token);

create index if not exists aimediart_documents_folder_id_idx
  on public.aimediart_documents (folder_id);

comment on column public.aimediart_documents.folder_id is
  'Sous-dossier GED (null = racine de la catégorie).';
comment on column public.aimediart_documents.share_token is
  'Token opaque pour lien de partage public (edge aimediart-doc-share).';
