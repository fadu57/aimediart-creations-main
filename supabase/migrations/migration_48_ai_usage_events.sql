-- migration_48_ai_usage_events.sql
-- Suivi des coûts IA / outils : table d'événements de consommation.

create table if not exists public.ai_usage_events (
  id               uuid          primary key default gen_random_uuid(),
  created_at       timestamptz   not null default now(),
  workspace_id     uuid          null,
  user_id          uuid          null references auth.users(id) on delete set null,
  project_id       uuid          null,
  tool_type        text          not null,                       -- 'tts' | 'image_gen' | 'ocr' | 'translation' | 'summary' | 'embedding' | 'chat' | ...
  provider         text          not null,                       -- 'groq' | 'openai' | 'google' | 'huggingface' | 'leonardo' | ...
  api_name         text          null,                           -- nom de l'API ou endpoint
  model_name       text          null,                           -- ex. 'llama3-70b', 'gpt-4o', 'tts-1', ...
  operation_name   text          null,                           -- ex. 'mediation_generation', 'bio_extraction', ...
  input_units      numeric       null,                           -- tokens / caractères / px / secondes selon unit_type
  output_units     numeric       null,
  unit_type        text          null,                           -- 'tokens' | 'chars' | 'images' | 'seconds' | 'calls'
  cost_estimated   numeric       not null default 0,
  currency         text          not null default 'EUR',
  status           text          not null default 'success'
                     check (status in ('success', 'error', 'partial', 'timeout')),
  request_id       text          null,
  source           text          null,                           -- contexte appelant (ex. 'edge_fn_mediation', 'frontend_tts')
  metadata         jsonb         not null default '{}'::jsonb
);

-- Commentaires de documentation
comment on table public.ai_usage_events is 'Événements de consommation IA / outils : chaque appel facturé est enregistré ici.';
comment on column public.ai_usage_events.tool_type     is 'Catégorie fonctionnelle : tts, image_gen, ocr, translation, summary, embedding, chat…';
comment on column public.ai_usage_events.provider      is 'Fournisseur API : groq, openai, google, huggingface, leonardo…';
comment on column public.ai_usage_events.unit_type     is 'Unité de facturation : tokens, chars, images, seconds, calls';
comment on column public.ai_usage_events.cost_estimated is 'Coût estimé dans la devise `currency`.';

-- Index simples
create index if not exists ai_usage_events_created_at_idx  on public.ai_usage_events (created_at desc);
create index if not exists ai_usage_events_tool_type_idx   on public.ai_usage_events (tool_type);
create index if not exists ai_usage_events_provider_idx    on public.ai_usage_events (provider);
create index if not exists ai_usage_events_model_name_idx  on public.ai_usage_events (model_name);
create index if not exists ai_usage_events_status_idx      on public.ai_usage_events (status);

-- Index composé : requêtes agrégées fréquentes (provider × période)
create index if not exists ai_usage_events_provider_date_idx on public.ai_usage_events (provider, created_at desc);

-- RLS
alter table public.ai_usage_events enable row level security;

-- Lecture : tout utilisateur authentifié (backoffice protégé côté routing React).
-- Pour restreindre aux admins uniquement, remplacer par un EXISTS sur public.users
-- comme dans migration_13_app_settings_policy_admin_agency.sql.
create policy "ai_usage_events_select_authenticated"
  on public.ai_usage_events for select
  to authenticated
  using (true);

-- Insertion : utilisateurs authentifiés (front) et service_role (Edge Functions, bypass RLS).
create policy "ai_usage_events_insert_authenticated"
  on public.ai_usage_events for insert
  to authenticated
  with check (true);

-- Vue agrégée par jour / fournisseur (optionnelle, pratique pour graphiques)
create or replace view public.ai_usage_daily_summary as
  select
    date_trunc('day', created_at) as day,
    provider,
    tool_type,
    currency,
    count(*)                        as call_count,
    sum(cost_estimated)             as total_cost,
    sum(input_units)                as total_input_units,
    sum(output_units)               as total_output_units
  from public.ai_usage_events
  group by 1, 2, 3, 4
  order by 1 desc;
