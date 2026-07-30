-- Catégorie « legal » : sous-dossiers / docs directement sous AIMEDIArt-Légal
-- (en plus de legal_inpi / legal_societe).

alter table public.aimediart_document_folders
  drop constraint if exists aimediart_document_folders_category_check;

alter table public.aimediart_document_folders
  add constraint aimediart_document_folders_category_check
  check (category in ('legal', 'legal_inpi', 'legal_societe', 'bp', 'marketing'));

alter table public.aimediart_documents
  drop constraint if exists aimediart_documents_category_check;

alter table public.aimediart_documents
  add constraint aimediart_documents_category_check
  check (category in ('legal', 'legal_inpi', 'legal_societe', 'bp', 'marketing'));
