-- Dossiers principaux GED dynamiques + bucket générique pour les nouveaux.

-- ---------------------------------------------------------------------------
-- 1. Table des sections (dossiers principaux)
-- ---------------------------------------------------------------------------
create table if not exists public.aimediart_ged_sections (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  constraint aimediart_ged_sections_slug_nonempty
    check (length(trim(slug)) > 0),
  constraint aimediart_ged_sections_name_nonempty
    check (length(trim(name)) > 0)
);

-- Contrainte UNIQUE (requis pour les FK category → slug)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'aimediart_ged_sections_slug_key'
  ) then
    alter table public.aimediart_ged_sections
      add constraint aimediart_ged_sections_slug_key unique (slug);
  end if;
end $$;

create index if not exists aimediart_ged_sections_sort_idx
  on public.aimediart_ged_sections (sort_order asc, name asc);

comment on table public.aimediart_ged_sections is
  'Dossiers principaux GED AIMEDIArt (dynamiques) — admins globaux uniquement.';

alter table public.aimediart_ged_sections enable row level security;

drop policy if exists "aimediart_sections_select_admin" on public.aimediart_ged_sections;
create policy "aimediart_sections_select_admin"
  on public.aimediart_ged_sections for select
  to authenticated
  using (public.is_aimediart_admin());

drop policy if exists "aimediart_sections_insert_admin" on public.aimediart_ged_sections;
create policy "aimediart_sections_insert_admin"
  on public.aimediart_ged_sections for insert
  to authenticated
  with check (public.is_aimediart_admin());

drop policy if exists "aimediart_sections_update_admin" on public.aimediart_ged_sections;
create policy "aimediart_sections_update_admin"
  on public.aimediart_ged_sections for update
  to authenticated
  using (public.is_aimediart_admin())
  with check (public.is_aimediart_admin());

drop policy if exists "aimediart_sections_delete_admin" on public.aimediart_ged_sections;
create policy "aimediart_sections_delete_admin"
  on public.aimediart_ged_sections for delete
  to authenticated
  using (public.is_aimediart_admin());

-- ---------------------------------------------------------------------------
-- 2. Seed legal / bp / marketing (libellés depuis app_settings si présents)
-- ---------------------------------------------------------------------------
insert into public.aimediart_ged_sections (slug, name, sort_order)
select v.slug, v.name, v.sort_order
from (values
  ('legal', 'AIMEDIArt-Légal', 10),
  ('bp', 'AIMEDIArt-BP', 20),
  ('marketing', 'AIMEDIArt-Marketing', 30)
) as v(slug, name, sort_order)
where not exists (
  select 1 from public.aimediart_ged_sections s
  where lower(trim(s.slug)) = lower(trim(v.slug))
);

do $$
declare
  raw text;
  labels jsonb;
begin
  select value::text into raw
  from public.app_settings
  where key = 'aimediart_ged_section_labels'
  limit 1;
  if raw is null or raw = '' then
    return;
  end if;
  begin
    labels := raw::jsonb;
  exception when others then
    return;
  end;
  if labels ? 'legal' and nullif(trim(labels->>'legal'), '') is not null then
    update public.aimediart_ged_sections
    set name = trim(labels->>'legal')
    where slug = 'legal';
  end if;
  if labels ? 'bp' and nullif(trim(labels->>'bp'), '') is not null then
    update public.aimediart_ged_sections
    set name = trim(labels->>'bp')
    where slug = 'bp';
  end if;
  if labels ? 'marketing' and nullif(trim(labels->>'marketing'), '') is not null then
    update public.aimediart_ged_sections
    set name = trim(labels->>'marketing')
    where slug = 'marketing';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Assouplir category (plus de CHECK fixe) + FK vers sections.slug
-- ---------------------------------------------------------------------------
alter table public.aimediart_document_folders
  drop constraint if exists aimediart_document_folders_category_check;

alter table public.aimediart_documents
  drop constraint if exists aimediart_documents_category_check;

-- Slugs legacy encore présents dans d’éventuelles lignes
insert into public.aimediart_ged_sections (slug, name, sort_order)
select v.slug, v.name, v.sort_order
from (values
  ('legal_inpi', 'INPI (legacy)', 11),
  ('legal_societe', 'Société (legacy)', 12)
) as v(slug, name, sort_order)
where not exists (
  select 1 from public.aimediart_ged_sections s
  where lower(trim(s.slug)) = lower(trim(v.slug))
);

-- FK category → slug (update cascade si renommage de slug — on ne renomme pas le slug en UI)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'aimediart_document_folders_category_fk'
  ) then
    alter table public.aimediart_document_folders
      add constraint aimediart_document_folders_category_fk
      foreign key (category) references public.aimediart_ged_sections(slug)
      on update cascade on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'aimediart_documents_category_fk'
  ) then
    alter table public.aimediart_documents
      add constraint aimediart_documents_category_fk
      foreign key (category) references public.aimediart_ged_sections(slug)
      on update cascade on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Bucket pour sections personnalisées
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aimediart-ged', 'aimediart-ged', false, 26214400, null)
on conflict (id) do nothing;

drop policy if exists "aimediart_docs_select" on storage.objects;
create policy "aimediart_docs_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id in ('aimediart-legal', 'aimediart-bp', 'aimediart-marketing', 'aimediart-ged')
    and public.is_aimediart_admin()
  );

drop policy if exists "aimediart_docs_insert" on storage.objects;
create policy "aimediart_docs_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id in ('aimediart-legal', 'aimediart-bp', 'aimediart-marketing', 'aimediart-ged')
    and public.is_aimediart_admin()
  );

drop policy if exists "aimediart_docs_update" on storage.objects;
create policy "aimediart_docs_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('aimediart-legal', 'aimediart-bp', 'aimediart-marketing', 'aimediart-ged')
    and public.is_aimediart_admin()
  );

drop policy if exists "aimediart_docs_delete" on storage.objects;
create policy "aimediart_docs_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('aimediart-legal', 'aimediart-bp', 'aimediart-marketing', 'aimediart-ged')
    and public.is_aimediart_admin()
  );
