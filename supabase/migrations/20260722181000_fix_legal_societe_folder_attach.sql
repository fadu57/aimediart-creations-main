-- Répare le rattachement Société (lower('Société') = 'société' ≠ 'societe').
-- Les chemins Storage legal_societe / legal_inpi restent préfixés societe/ et inpi/.

update public.aimediart_documents d
set folder_id = (
  select f.id
  from public.aimediart_document_folders f
  where f.category = 'legal'
    and lower(trim(f.name)) in ('societe', 'société')
  limit 1
)
where d.category = 'legal'
  and d.folder_id is null
  and d.path like 'societe/%';

update public.aimediart_documents d
set folder_id = (
  select f.id
  from public.aimediart_document_folders f
  where f.category = 'legal'
    and lower(trim(f.name)) = 'inpi'
  limit 1
)
where d.category = 'legal'
  and d.folder_id is null
  and d.path like 'inpi/%';
