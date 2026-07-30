-- Horizon : langue de connexion + 1 langue de médiation supplémentaire incluse (1 à 2 langues)
UPDATE public.pricing
SET
  included_mediation_langs_min = 1,
  included_mediation_langs_max = 2
WHERE plan_code = 'HORIZON'::public.pricing_plan_code;
