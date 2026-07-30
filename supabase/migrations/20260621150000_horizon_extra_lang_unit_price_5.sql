-- Horizon : langues supplémentaires médiation / audio à 5 € TTC (aligné Atelier)
UPDATE public.pricing_options po
SET
  unit_price_ttc_eur = 5.00,
  updated_at = now()
FROM public.pricing p
WHERE po.pricing_id = p.pricing_id
  AND p.plan_code = 'HORIZON'::public.pricing_plan_code
  AND po.option_code IN (
    'EXTRA_MEDIATION_LANG'::public.pricing_option_code,
    'EXTRA_AUDIO_LANG'::public.pricing_option_code
  );
