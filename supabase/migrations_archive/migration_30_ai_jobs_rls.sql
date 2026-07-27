-- ai_jobs : statuts worker + RLS lecture pour le polling front
-- Exécuter dans Supabase → SQL Editor

-- 1) Statut retry_later (utilisé par ai-worker)
alter table public.ai_jobs drop constraint if exists ai_jobs_status_check;
alter table public.ai_jobs add constraint ai_jobs_status_check
  check (status in ('pending', 'running', 'done', 'error', 'retry_later'));

-- 2) Lien utilisateur (pour policies SELECT côté client)
alter table public.ai_jobs
  add column if not exists created_by uuid references auth.users (id) on delete set null;

create index if not exists ai_jobs_created_by_idx on public.ai_jobs (created_by);

-- 3) RLS : lecture des propres jobs (polling front)
drop policy if exists "ai_jobs_select_own" on public.ai_jobs;
drop policy if exists "ai_jobs_select_own_or_legacy" on public.ai_jobs;
create policy "ai_jobs_select_own_or_legacy"
  on public.ai_jobs
  for select
  to authenticated
  using (created_by is null or created_by = auth.uid());

comment on policy "ai_jobs_select_own_or_legacy" on public.ai_jobs is
  'Polling front : jobs de l’utilisateur ou jobs legacy (created_by null avant migration).';

-- INSERT/UPDATE : uniquement via Edge Functions (service_role, bypass RLS).
