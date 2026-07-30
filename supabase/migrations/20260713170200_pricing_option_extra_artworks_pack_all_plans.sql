-- Pack 50 œuvres : tous les plans actifs sauf Étincelle et Zénith
INSERT INTO public.pricing_options (pricing_id, option_code, billing_mode, unit_price_ttc_eur, description)
SELECT p.pricing_id, 'EXTRA_ARTWORKS_PACK'::public.pricing_option_code, 'monthly_recurring'::public.pricing_option_billing_mode, 45.00::numeric, 'Pack de 50 oeuvres supplémentaires'
FROM public.pricing p
WHERE p.is_active = true
  AND p.archived_at IS NULL
  AND p.plan_code IS NOT NULL
  AND p.plan_code NOT IN (
    'ETINCELLE'::public.pricing_plan_code,
    'ZENITH'::public.pricing_plan_code
  )
ON CONFLICT (pricing_id, option_code) DO UPDATE SET
  unit_price_ttc_eur = EXCLUDED.unit_price_ttc_eur,
  billing_mode = EXCLUDED.billing_mode,
  description = EXCLUDED.description,
  updated_at = now();
