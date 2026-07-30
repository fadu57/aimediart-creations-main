-- Rayonnement : options langues supplémentaires manquantes dans pricing_options
-- (Atelier 5 €, Horizon / Envergure 15 € — Rayonnement aligné sur 15 € TTC / langue / mois)
INSERT INTO public.pricing_options (pricing_id, option_code, billing_mode, unit_price_ttc_eur, description)
SELECT p.pricing_id, o.option_code, o.billing_mode, o.unit_price, o.description
FROM public.pricing p
JOIN (VALUES
  ('EXTRA_MEDIATION_LANG'::public.pricing_option_code, 'monthly_recurring'::public.pricing_option_billing_mode, 15.00::numeric, 'Langue médiation supplémentaire'),
  ('EXTRA_AUDIO_LANG', 'monthly_recurring', 15.00, 'Langue audio-guide supplémentaire')
) AS o(option_code, billing_mode, unit_price, description) ON true
WHERE p.plan_code = 'RAYONNEMENT'::public.pricing_plan_code
ON CONFLICT (pricing_id, option_code) DO UPDATE SET
  unit_price_ttc_eur = EXCLUDED.unit_price_ttc_eur,
  billing_mode = EXCLUDED.billing_mode,
  description = EXCLUDED.description,
  updated_at = now();
