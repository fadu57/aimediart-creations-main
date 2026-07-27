-- migration_54_cost_provider_vercel.sql
-- Ligne de coûts Vercel (hébergement frontend) — plan Hobby par défaut.

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
  'vercel',
  'Vercel',
  'other',
  true,
  true,
  true,
  false,
  false,
  'active',
  'Hébergement frontend (Vite). Plan Hobby par défaut — basculer vers Pro (20 $/mo) dans Paramètres → Coûts.',
  '{"plan":"Hobby","amount_usd":0,"currency":"USD","cost_mode":"fixed_monthly","billing_mode":"fixed_monthly"}'::jsonb
)
on conflict (provider_key) do nothing;
