-- migration_59_project_work_sessions.sql
-- Suivi du temps projet via chronomètre (sessions start / pause / stop).

create table if not exists public.project_work_sessions (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  started_at           timestamptz not null default now(),
  ended_at             timestamptz null,
  accumulated_seconds  integer     not null default 0 check (accumulated_seconds >= 0),
  segment_started_at   timestamptz null,
  status               text        not null default 'running'
                         check (status in ('running', 'paused', 'completed')),
  work_date            date        not null,
  notes                text        null,
  updated_at           timestamptz not null default now()
);

comment on table public.project_work_sessions is
  'Sessions chronomètre projet (temps réel de travail backoffice / dev).';

create unique index if not exists project_work_sessions_one_active_per_user
  on public.project_work_sessions (user_id)
  where status in ('running', 'paused');

create index if not exists project_work_sessions_work_date_idx
  on public.project_work_sessions (work_date desc);

create index if not exists project_work_sessions_user_date_idx
  on public.project_work_sessions (user_id, work_date desc);

alter table public.project_work_sessions enable row level security;

create policy "project_work_sessions_select_authenticated"
  on public.project_work_sessions for select
  to authenticated
  using (true);

create policy "project_work_sessions_write_admin"
  on public.project_work_sessions for all
  to authenticated
  using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role_id in (1, 2, 3, 4)
    )
  )
  with check (
    exists (
      select 1 from public.users u
      where u.id = auth.uid() and u.role_id in (1, 2, 3, 4)
    )
  );
