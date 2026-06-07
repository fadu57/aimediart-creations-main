-- migration_58_project_work_days.sql
-- Temps passé sur le projet : saisie manuelle jour par jour (prioritaire sur l'estimation git).

create table if not exists public.project_work_days (
  work_date   date        primary key,
  minutes     integer     not null check (minutes >= 0 and minutes <= 1440),
  notes       text        null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid        null references auth.users(id) on delete set null
);

comment on table public.project_work_days is
  'Temps de travail projet saisi manuellement (minutes par jour). Prioritaire sur l''estimation git.';

create index if not exists project_work_days_updated_at_idx
  on public.project_work_days (updated_at desc);

alter table public.project_work_days enable row level security;

create policy "project_work_days_select_authenticated"
  on public.project_work_days for select
  to authenticated
  using (true);

create policy "project_work_days_write_admin"
  on public.project_work_days for all
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
