-- Soft-delete des dossiers principaux GED (corbeille).

alter table public.aimediart_ged_sections
  add column if not exists deleted_at timestamptz null;

create index if not exists aimediart_ged_sections_deleted_at_idx
  on public.aimediart_ged_sections (deleted_at)
  where deleted_at is not null;

comment on column public.aimediart_ged_sections.deleted_at is
  'Soft-delete : non null = en corbeille (restaurable).';
