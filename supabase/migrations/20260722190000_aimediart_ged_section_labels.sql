-- Libellés des dossiers principaux GED (AIMEDIArt-Légal / BP / Marketing).
insert into public.app_settings (key, value)
values (
  'aimediart_ged_section_labels',
  '{"legal":"AIMEDIArt-Légal","bp":"AIMEDIArt-BP","marketing":"AIMEDIArt-Marketing"}'
)
on conflict (key) do nothing;
