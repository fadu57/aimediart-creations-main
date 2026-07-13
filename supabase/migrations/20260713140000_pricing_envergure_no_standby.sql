-- ENVERGURE : pas de plan veille (alignement produit / vitrine tarifs).
UPDATE public.pricing
SET standby_monthly_price_ttc_eur = NULL,
    updated_at = now()
WHERE plan_code = 'ENVERGURE'::public.pricing_plan_code;

DELETE FROM public.pricing_options po
USING public.pricing p
WHERE po.pricing_id = p.pricing_id
  AND p.plan_code = 'ENVERGURE'::public.pricing_plan_code
  AND po.option_code = 'STANDBY'::public.pricing_option_code;
