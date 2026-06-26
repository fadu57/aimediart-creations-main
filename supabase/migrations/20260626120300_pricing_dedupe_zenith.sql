-- Dédoublonnage ZENITH : on ne conserve qu'une seule offre Zénith active.
-- Cause du doublon : une ligne historique (pricing_plan = 'LE ZÉNITH', plan_code NULL)
-- coexistait avec la ligne canonique (plan_code = 'ZENITH'), l'index unique partiel
-- n'empêchant pas le doublon quand plan_code est NULL.
-- Règle : on garde en priorité la ligne dont plan_code = 'ZENITH', sinon le plus petit
-- pricing_id ; les autres sont archivées (is_active = false) sans suppression (FK sûres).

BEGIN;

WITH zenith_rows AS (
  SELECT pricing_id, plan_code
  FROM public.pricing
  WHERE plan_code = 'ZENITH'::public.pricing_plan_code
     OR upper(coalesce(pricing_plan, '')) LIKE '%ZENITH%'
     OR upper(coalesce(pricing_plan, '')) LIKE '%ZÉNITH%'
),
keep AS (
  SELECT pricing_id
  FROM zenith_rows
  ORDER BY (plan_code = 'ZENITH'::public.pricing_plan_code) DESC NULLS LAST, pricing_id ASC
  LIMIT 1
)
UPDATE public.pricing p
SET is_active = false,
    archived_at = now()
WHERE p.pricing_id IN (SELECT pricing_id FROM zenith_rows)
  AND p.pricing_id NOT IN (SELECT pricing_id FROM keep);

-- Normalisation de la ligne conservée
UPDATE public.pricing
SET is_active = true,
    archived_at = NULL,
    plan_code = 'ZENITH'::public.pricing_plan_code,
    pricing_plan = 'ZENITH',
    display_name = COALESCE(display_name, 'Zénith'),
    pricing_label = COALESCE(pricing_label, 'LE ZÉNITH'),
    is_quote_only = true,
    pricing_is_unlimited = true,
    sort_order = 6
WHERE pricing_id = (
  SELECT pricing_id
  FROM public.pricing
  WHERE plan_code = 'ZENITH'::public.pricing_plan_code
     OR upper(coalesce(pricing_plan, '')) LIKE '%ZENITH%'
     OR upper(coalesce(pricing_plan, '')) LIKE '%ZÉNITH%'
  ORDER BY (plan_code = 'ZENITH'::public.pricing_plan_code) DESC NULLS LAST, pricing_id ASC
  LIMIT 1
);

COMMIT;
