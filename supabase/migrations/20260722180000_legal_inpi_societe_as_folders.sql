-- INPI et Société deviennent des sous-dossiers dynamiques sous category = 'legal'.
-- Migration des docs / dossiers legal_inpi et legal_societe.

-- 1. Créer INPI et Société s'ils n'existent pas encore
insert into public.aimediart_document_folders (category, name)
select 'legal', 'INPI'
where not exists (
  select 1 from public.aimediart_document_folders
  where category = 'legal' and lower(trim(name)) = 'inpi'
);

insert into public.aimediart_document_folders (category, name)
select 'legal', 'Société'
where not exists (
  select 1 from public.aimediart_document_folders
  where category = 'legal' and lower(trim(name)) = 'societe'
);

-- 2. Docs à la racine de legal_inpi → dossier INPI
update public.aimediart_documents d
set
  category = 'legal',
  folder_id = (
    select f.id
    from public.aimediart_document_folders f
    where f.category = 'legal' and lower(trim(f.name)) = 'inpi'
    limit 1
  )
where d.category = 'legal_inpi'
  and d.folder_id is null;

-- 3. Docs à la racine de legal_societe → dossier Société
update public.aimediart_documents d
set
  category = 'legal',
  folder_id = (
    select f.id
    from public.aimediart_document_folders f
    where f.category = 'legal' and lower(trim(f.name)) = 'societe'
    limit 1
  )
where d.category = 'legal_societe'
  and d.folder_id is null;

-- 4. Sous-dossiers dynamiques legal_inpi / legal_societe → legal
--    (évite les collisions de noms avec un suffixe)
do $$
declare
  r record;
  new_name text;
  suffix text;
begin
  for r in
    select * from public.aimediart_document_folders
    where category in ('legal_inpi', 'legal_societe')
  loop
    suffix := case when r.category = 'legal_inpi' then ' (INPI)' else ' (Société)' end;
    new_name := r.name;
    if exists (
      select 1 from public.aimediart_document_folders x
      where x.category = 'legal'
        and lower(trim(x.name)) = lower(trim(new_name))
        and x.id <> r.id
    ) then
      new_name := r.name || suffix;
    end if;
    update public.aimediart_document_folders
    set category = 'legal', name = new_name
    where id = r.id;
  end loop;
end $$;

-- 5. Documents restants (déjà dans un sous-dossier) → category legal
update public.aimediart_documents
set category = 'legal'
where category in ('legal_inpi', 'legal_societe');
