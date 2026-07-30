-- Tokens de partage public pour dossiers GED (sous-dossiers + dossiers principaux).

-- Sous-dossiers
alter table public.aimediart_document_folders
  add column if not exists share_token uuid;

update public.aimediart_document_folders
set share_token = gen_random_uuid()
where share_token is null;

alter table public.aimediart_document_folders
  alter column share_token set default gen_random_uuid();

alter table public.aimediart_document_folders
  alter column share_token set not null;

create unique index if not exists aimediart_document_folders_share_token_uidx
  on public.aimediart_document_folders (share_token);

comment on column public.aimediart_document_folders.share_token is
  'Token opaque pour lien de partage public du sous-dossier (edge aimediart-doc-share).';

-- Dossiers principaux (sections)
alter table public.aimediart_ged_sections
  add column if not exists share_token uuid;

update public.aimediart_ged_sections
set share_token = gen_random_uuid()
where share_token is null;

alter table public.aimediart_ged_sections
  alter column share_token set default gen_random_uuid();

alter table public.aimediart_ged_sections
  alter column share_token set not null;

create unique index if not exists aimediart_ged_sections_share_token_uidx
  on public.aimediart_ged_sections (share_token);

comment on column public.aimediart_ged_sections.share_token is
  'Token opaque pour lien de partage public du dossier principal (edge aimediart-doc-share).';
