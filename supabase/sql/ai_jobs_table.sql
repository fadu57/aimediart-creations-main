-- Table file d’attente pour jobs IA (Groq via Edge Function ai-worker).
-- À exécuter dans Supabase → SQL Editor (ou migration).

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  model text not null default 'llama-3.1-8b-instant',
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'error', 'retry_later')),
  created_by uuid references auth.users (id) on delete set null,
  result jsonb,
  error jsonb,
  attempts integer not null default 0,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_jobs_pending_run_idx
  on public.ai_jobs (status, next_run_at, created_at)
  where status = 'pending';

comment on table public.ai_jobs is 'Jobs asynchrones pour appels Groq (créés via API, traités par worker).';

-- RLS : à adapter selon ta politique. Le worker et l’API utilisent la service role (bypass RLS).
-- Exemple : aucune policy pour anon/authenticated si tout passe par routes serveur + service role.

alter table public.ai_jobs enable row level security;

-- INSERT/UPDATE : Edge Functions avec service_role (bypass RLS).
-- SELECT : policy ai_jobs_select_own (migration_30) pour le polling front (created_by = auth.uid()).
