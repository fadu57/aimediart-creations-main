-- migration_57_fix_ovh_provider.sql
-- Réactive / crée la ligne OVH si la carte n'apparaissait pas (status inactive ou ligne absente).

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
  false,
  false,
  false,
  false,
  'detected_not_configured',
  'Factures OVH via API (≥ 2026-04-01). Secrets : OVH_APP_KEY, OVH_APP_SECRET, OVH_CONSUMER_KEY.',
  '{"currency":"EUR","billing_mode":"ovh_invoices","import_from_date":"2026-04-01","amount_type":"ttc"}'::jsonb
)
on conflict (provider_key) do update set
  provider_name = excluded.provider_name,
  category = excluded.category,
  detected_in_code = true,
  status = case
    when public.cost_providers.status = 'inactive' then 'detected_not_configured'
    else public.cost_providers.status
  end,
  notes = excluded.notes,
  metadata = public.cost_providers.metadata || excluded.metadata,
  updated_at = now();

-- Réactiver si marqué inactive par une ancienne analyse
update public.cost_providers
set status = 'detected_not_configured', detected_in_code = true, updated_at = now()
where provider_key = 'ovh' and status = 'inactive';
