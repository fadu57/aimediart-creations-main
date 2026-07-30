-- Horizon : 5 langues de médiation incluses (min = max = 5)
UPDATE public.pricing
SET
  included_mediation_langs_min = 5,
  included_mediation_langs_max = 5
WHERE plan_code = 'HORIZON'::public.pricing_plan_code;
