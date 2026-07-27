-- migration_55_cost_provider_ovh.sql
-- Ligne de coûts OVH — montant mensuel EUR saisi manuellement dans l'UI.

insert into public.cost_providers (
  provider_key,
  provider_name,
  category,
  detected_in_code,
  configured,
  actively_used,
  sync_supported,
  cost_import_supported,
  status,
  notes,
  metadata
) values (
  'ovh',
  'OVH',
  'other',
  true,
  true,
  true,
  false,
  false,
  'active',
  'Factures OVH via API (≥ 2026-04-01). Secrets : OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY.',
  '{"currency":"EUR","billing_mode":"ovh_invoices","import_from_date":"2026-04-01","amount_type":"ttc"}'::jsonb
)
on conflict (provider_key) do nothing;
