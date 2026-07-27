-- migration_51_ai_usage_events_import_hash.sql
-- Idempotence des imports de coûts (backfill + sync incrémentale).

alter table public.ai_usage_events
  add column if not exists import_hash text null;

comment on column public.ai_usage_events.import_hash is
  'Clé d''idempotence pour les imports billing / logs (ex. google_billing:…, groq_log:…).';

-- Unicité partielle : les événements manuels sans hash restent possibles.
create unique index if not exists ai_usage_events_import_hash_uidx
  on public.ai_usage_events (import_hash)
  where import_hash is not null;

create index if not exists ai_usage_events_import_hash_idx
  on public.ai_usage_events (import_hash)
  where import_hash is not null;
