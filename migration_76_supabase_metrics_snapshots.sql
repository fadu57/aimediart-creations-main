-- migration_76_supabase_metrics_snapshots.sql
-- Historique local des métriques Prometheus (Metrics API Supabase).

create table if not exists public.supabase_metrics_snapshots (
  id          bigserial primary key,
  captured_at timestamptz not null default now(),
  values      jsonb not null default '{}'::jsonb,
  counters    jsonb not null default '{}'::jsonb
);

create index if not exists supabase_metrics_snapshots_captured_at_idx
  on public.supabase_metrics_snapshots (captured_at desc);

comment on table public.supabase_metrics_snapshots is
  'Snapshots Metrics API Supabase — alimente les graphiques /suivi_supabase (service_role uniquement).';

alter table public.supabase_metrics_snapshots enable row level security;

revoke all on table public.supabase_metrics_snapshots from public;
grant select, insert, delete on table public.supabase_metrics_snapshots to service_role;
grant usage, select on sequence public.supabase_metrics_snapshots_id_seq to service_role;
