-- Commentaires courts (2–3 lignes) sur dossiers principaux et sous-dossiers GED.

alter table public.aimediart_ged_sections
  add column if not exists description text;

alter table public.aimediart_document_folders
  add column if not exists description text;

comment on column public.aimediart_ged_sections.description is
  'Commentaire libre (2–3 lignes) affiché en popup dans la GED.';

comment on column public.aimediart_document_folders.description is
  'Commentaire libre (2–3 lignes) affiché en popup dans la GED.';
