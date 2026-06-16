-- Lecture ai_jobs pour tout utilisateur authentifié (backoffice).
-- Corrige le polling quand created_by ne correspond pas au JWT (session / getUser).
-- Les INSERT/UPDATE restent réservés aux Edge Functions (service_role).

drop policy if exists "ai_jobs_select_own" on public.ai_jobs;
drop policy if exists "ai_jobs_select_own_or_legacy" on public.ai_jobs;
drop policy if exists "ai_jobs_select_authenticated" on public.ai_jobs;

create policy "ai_jobs_select_authenticated"
  on public.ai_jobs
  for select
  to authenticated
  using (true);

comment on policy "ai_jobs_select_authenticated" on public.ai_jobs is
  'Backoffice : lecture des jobs IA pour le polling front (utilisateurs connectés).';
