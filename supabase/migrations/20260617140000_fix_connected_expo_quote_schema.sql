-- Complète le schéma connected_expo_quote_requests (migration_78 + preferred_contact_time).
-- Idempotent : safe si migration_78 déjà appliquée.

create table if not exists public.connected_expo_quote_requests (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users (id) on delete set null,
  agency_id            uuid references public.agencies (id) on delete set null,
  org_name             text not null,
  contact_name         text not null,
  contact_email        text not null,
  address              text,
  zip_code             text,
  city                 text,
  contact_phone        text not null,
  need_description     text not null,
  floor_plan_url       text,
  preferred_contact_time text,
  created_at           timestamptz not null default now()
);

alter table public.connected_expo_quote_requests
  add column if not exists preferred_contact_time text;

create index if not exists connected_expo_quote_requests_created_at_idx
  on public.connected_expo_quote_requests (created_at desc);

comment on column public.connected_expo_quote_requests.preferred_contact_time is
  'Créneau souhaité pour être recontacté (date, heure, etc.).';

alter table public.connected_expo_quote_requests enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'connected_expo_quote_requests'
      and policyname = 'connected_expo_quote_insert_own'
  ) then
    create policy connected_expo_quote_insert_own
      on public.connected_expo_quote_requests
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'connected_expo_quote_requests'
      and policyname = 'connected_expo_quote_select_own'
  ) then
    create policy connected_expo_quote_select_own
      on public.connected_expo_quote_requests
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;
