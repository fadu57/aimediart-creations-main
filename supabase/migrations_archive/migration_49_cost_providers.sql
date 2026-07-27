-- migration_49_cost_providers.sql
-- Inventaire des fournisseurs IA / outils et historique des opérations de sync.

-- ===========================================================================
-- TABLE : cost_providers
-- ===========================================================================
create table if not exists public.cost_providers (
  id                     uuid        primary key default gen_random_uuid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  provider_key           text        not null unique,
  provider_name          text        not null,
  category               text        null,           -- 'llm' | 'tts' | 'image' | 'ocr' | 'translation' | 'embedding' | 'email' | 'other'
  detected_in_code       boolean     not null default false,
  configured             boolean     not null default false,
  sync_supported         boolean     not null default false,
  cost_import_supported  boolean     not null default false,
  status                 text        not null default 'unknown'
                           check (status in ('active','inactive','unknown','error','detected_not_configured')),
  last_detected_at       timestamptz null,
  last_synced_at         timestamptz null,
  last_sync_status       text        null,
  last_sync_error        text        null,
  notes                  text        null,
  metadata               jsonb       not null default '{}'::jsonb
);

comment on table public.cost_providers is 'Inventaire des fournisseurs IA / outils : détection et état de synchronisation des coûts.';
comment on column public.cost_providers.provider_key    is 'Identifiant technique unique (ex. groq, openai, google_gemini).';
comment on column public.cost_providers.configured      is 'True si la configuration (API key, envars) est détectée côté Edge Function.';
comment on column public.cost_providers.sync_supported  is 'True si une logique de sync des coûts existe pour ce fournisseur.';
comment on column public.cost_providers.status          is 'État opérationnel : active, inactive, unknown, error, detected_not_configured.';

-- Trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger cost_providers_updated_at
  before update on public.cost_providers
  for each row execute procedure public.set_updated_at();

-- Index
create index if not exists cost_providers_status_idx      on public.cost_providers (status);
create index if not exists cost_providers_category_idx    on public.cost_providers (category);
create index if not exists cost_providers_updated_at_idx  on public.cost_providers (updated_at desc);

-- RLS
alter table public.cost_providers enable row level security;

create policy "cost_providers_select_authenticated"
  on public.cost_providers for select
  to authenticated
  using (true);

create policy "cost_providers_insert_authenticated"
  on public.cost_providers for insert
  to authenticated
  with check (true);

create policy "cost_providers_update_authenticated"
  on public.cost_providers for update
  to authenticated
  using (true);

-- ===========================================================================
-- TABLE : provider_sync_runs
-- Historique des analyses / synchronisations lancées depuis l'UI.
-- ===========================================================================
create table if not exists public.provider_sync_runs (
  id            uuid        primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  run_type      text        not null  check (run_type in ('analyze','sync_costs')),
  provider_key  text        null,                    -- null = opération globale
  status        text        not null  check (status in ('running','success','partial','error')),
  message       text        null,
  details       jsonb       not null default '{}'::jsonb,
  triggered_by  uuid        null references auth.users(id) on delete set null,
  duration_ms   integer     null
);

comment on table public.provider_sync_runs is 'Historique des exécutions d''analyse et de synchronisation des fournisseurs.';

create index if not exists provider_sync_runs_created_at_idx  on public.provider_sync_runs (created_at desc);
create index if not exists provider_sync_runs_run_type_idx    on public.provider_sync_runs (run_type);
create index if not exists provider_sync_runs_triggered_by_idx on public.provider_sync_runs (triggered_by);

alter table public.provider_sync_runs enable row level security;

create policy "provider_sync_runs_select_authenticated"
  on public.provider_sync_runs for select
  to authenticated
  using (true);

create policy "provider_sync_runs_insert_authenticated"
  on public.provider_sync_runs for insert
  to authenticated
  with check (true);
