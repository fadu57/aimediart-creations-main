-- migration_78_connected_expo_quote_requests.sql
-- Demandes de devis « Exposition connectée » (vitrine publique /organisation/connexion).

create table if not exists public.connected_expo_quote_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete set null,
  agency_id       uuid references public.agencies (id) on delete set null,
  org_name        text not null,
  contact_name    text not null,
  contact_email   text not null,
  address         text,
  zip_code        text,
  city            text,
  contact_phone   text not null,
  need_description text not null,
  floor_plan_url  text,
  created_at      timestamptz not null default now()
);

create index if not exists connected_expo_quote_requests_created_at_idx
  on public.connected_expo_quote_requests (created_at desc);

comment on table public.connected_expo_quote_requests is
  'Demandes de devis Wi-Fi exposition connectée (vitrine /organisation/connexion).';

alter table public.connected_expo_quote_requests enable row level security;

create policy connected_expo_quote_insert_own
  on public.connected_expo_quote_requests
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy connected_expo_quote_select_own
  on public.connected_expo_quote_requests
  for select
  to authenticated
  using (auth.uid() = user_id);
