-- migration_56_ovh_invoices.sql
-- OVH : factures via API (à partir du 01/04/2026 uniquement).

update public.cost_providers
set
  notes = 'Factures OVH importées via API OVHcloud (/me/bill). Seules les factures ≥ 2026-04-01 sont suivies.',
  metadata = coalesce(metadata, '{}'::jsonb) || '{
    "billing_mode":"ovh_invoices",
    "currency":"EUR",
    "import_from_date":"2026-04-01",
    "amount_type":"ttc"
  }'::jsonb
where provider_key = 'ovh';

-- Retirer d''éventuels imports antérieurs au cutoff
delete from public.ai_usage_events
where provider = 'ovh'
  and (
    created_at < '2026-04-01T00:00:00.000Z'
    or coalesce(metadata->>'invoice_date', left(created_at::text, 10)) < '2026-04-01'
  );

-- Désactiver le cron mensuel obsolète (forfait fixe) — ignore si pg_cron absent
DO $$
DECLARE
  job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'sync-ovh-costs-monthly' LIMIT 1;
    IF job_id IS NOT NULL THEN PERFORM cron.unschedule(job_id); END IF;
  END IF;
END;
$$;

-- Prérequis idempotence (migration_51) — safe si déjà appliquée
alter table public.ai_usage_events
  add column if not exists import_hash text null;

create unique index if not exists ai_usage_events_import_hash_uidx
  on public.ai_usage_events (import_hash)
  where import_hash is not null;

-- Seed : factures ≥ 2026-04-01 (TTC) — NOT EXISTS car index unique partiel
insert into public.ai_usage_events (
  import_hash, created_at, tool_type, provider, api_name, model_name,
  operation_name, cost_estimated, currency, status, source, metadata
)
select v.* from (values
  ('ovh_invoice:FR76979810', '2026-04-06T12:00:00.000Z'::timestamptz, 'infrastructure', 'ovh', 'ovh_invoice', 'FR76979810', 'invoice_payment', 9.35::numeric, 'EUR', 'success', 'manual_entry', '{"invoice_ref":"FR76979810","invoice_date":"2026-04-06","amount_type_used":"ttc","amount_ht":7.79,"amount_ttc":9.35,"billing_mode":"ovh_invoices","import_from_date":"2026-04-01"}'::jsonb),
  ('ovh_invoice:FR76979837', '2026-04-06T12:00:00.000Z'::timestamptz, 'infrastructure', 'ovh', 'ovh_invoice', 'FR76979837', 'invoice_payment', 14.21::numeric, 'EUR', 'success', 'manual_entry', '{"invoice_ref":"FR76979837","invoice_date":"2026-04-06","amount_type_used":"ttc","amount_ht":11.84,"amount_ttc":14.21,"billing_mode":"ovh_invoices","import_from_date":"2026-04-01"}'::jsonb),
  ('ovh_invoice:FR77123181', '2026-04-30T12:00:00.000Z'::timestamptz, 'infrastructure', 'ovh', 'ovh_invoice', 'FR77123181', 'invoice_payment', 0.36::numeric, 'EUR', 'success', 'manual_entry', '{"invoice_ref":"FR77123181","invoice_date":"2026-04-30","amount_type_used":"ttc","amount_ht":0.30,"amount_ttc":0.36,"billing_mode":"ovh_invoices","import_from_date":"2026-04-01"}'::jsonb),
  ('ovh_invoice:FR77668185', '2026-05-06T12:00:00.000Z'::timestamptz, 'infrastructure', 'ovh', 'ovh_invoice', 'FR77668185', 'invoice_payment', 0.00::numeric, 'EUR', 'success', 'manual_entry', '{"invoice_ref":"FR77668185","invoice_date":"2026-05-06","amount_type_used":"ttc","amount_ht":0.00,"amount_ttc":0.00,"billing_mode":"ovh_invoices","import_from_date":"2026-04-01"}'::jsonb),
  ('ovh_invoice:FR77801920', '2026-05-30T12:00:00.000Z'::timestamptz, 'infrastructure', 'ovh', 'ovh_invoice', 'FR77801920', 'invoice_payment', 0.02::numeric, 'EUR', 'success', 'manual_entry', '{"invoice_ref":"FR77801920","invoice_date":"2026-05-30","amount_type_used":"ttc","amount_ht":0.02,"amount_ttc":0.02,"billing_mode":"ovh_invoices","import_from_date":"2026-04-01"}'::jsonb),
  ('ovh_invoice:FR77865132', '2026-06-01T12:00:00.000Z'::timestamptz, 'infrastructure', 'ovh', 'ovh_invoice', 'FR77865132', 'invoice_payment', 0.36::numeric, 'EUR', 'success', 'manual_entry', '{"invoice_ref":"FR77865132","invoice_date":"2026-06-01","amount_type_used":"ttc","amount_ht":0.30,"amount_ttc":0.36,"billing_mode":"ovh_invoices","import_from_date":"2026-04-01"}'::jsonb)
) as v(import_hash, created_at, tool_type, provider, api_name, model_name, operation_name, cost_estimated, currency, status, source, metadata)
where not exists (
  select 1 from public.ai_usage_events e where e.import_hash = v.import_hash
);
