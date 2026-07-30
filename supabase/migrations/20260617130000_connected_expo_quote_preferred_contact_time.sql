-- Ajout du créneau de contact préféré aux demandes de devis exposition connectée.

alter table public.connected_expo_quote_requests
  add column if not exists preferred_contact_time text;

comment on column public.connected_expo_quote_requests.preferred_contact_time is
  'Créneau souhaité pour être recontacté (date, heure, etc.).';
