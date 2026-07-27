-- migration_53_cost_provider_supabase.sql
-- Ligne de coûts Supabase (hébergement) + seed Cursor si absent.

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
) values
(
  'supabase',
  'Supabase',
  'other',
  true,
  true,
  true,
  false,
  false,
  'active',
  'Hébergement BDD + Edge Functions. Plan Free par défaut — basculer vers Pro (25 $/mo) dans Paramètres → Coûts.',
  '{"plan":"Free","amount_usd":0,"currency":"USD","cost_mode":"fixed_monthly","billing_mode":"fixed_monthly"}'::jsonb
),
(
  'cursor',
  'Cursor',
  'other',
  true,
  true,
  true,
  false,
  false,
  'active',
  'Abonnement IDE Cursor. Coût mensuel fixe selon le plan (Pro / Pro+).',
  '{"plan":"Pro+","amount_usd":60,"currency":"USD","cost_mode":"fixed_monthly","billing_mode":"fixed_monthly"}'::jsonb
)
on conflict (provider_key) do nothing;
