-- Palier ENVERGURE + ajustement des paliers (œuvres / visiteurs / langues / audios)
-- + remise annuelle « 10 mois pour 12 » (pay 10, get 12) sur tous les plans payants.
--
-- Convention de saisie validée :
--   Atelier / Horizon : prix annoncés en TTC (89 / 149)
--   Étincelle / Envergure / Rayonnement : prix annoncés en HT (0 / 249 / 549)
-- La base stocke en TTC (pricing_monthly_ttc_eur). TVA 20 % => TTC = HT * 1,2.
--   Envergure : 249 HT  -> 298,80 TTC
--   Rayonnement : 549 HT -> 658,80 TTC

BEGIN;

-- 1. ENVERGURE — insertion si absent
INSERT INTO public.pricing (
  pricing_label, pricing_plan, plan_code, display_name,
  pricing_monthly_ttc_eur, pricing_max_oeuvres, pricing_max_visitors,
  max_artworks_included, max_visitors_per_month_included,
  standby_monthly_price_ttc_eur,
  included_mediation_langs_min, included_mediation_langs_max, included_audio_langs,
  trial_duration_days, is_quote_only, pricing_is_unlimited, sort_order, is_active
)
SELECT
  'L''ENVERGURE', 'L''ENVERGURE', 'ENVERGURE'::public.pricing_plan_code, 'Envergure',
  298.80, 1500, 5000,
  1500, 5000,
  79.00,
  3, 3, 3,
  NULL, false, false, 4, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricing p WHERE p.plan_code = 'ENVERGURE'::public.pricing_plan_code
);

-- 2. ENVERGURE — valeurs canoniques (idempotent)
UPDATE public.pricing SET
  pricing_label = 'L''ENVERGURE',
  pricing_plan = 'L''ENVERGURE',
  display_name = 'Envergure',
  pricing_monthly_ttc_eur = 298.80,
  pricing_max_oeuvres = 1500,
  pricing_max_visitors = 5000,
  max_artworks_included = 1500,
  max_visitors_per_month_included = 5000,
  standby_monthly_price_ttc_eur = 79.00,
  included_mediation_langs_min = 3,
  included_mediation_langs_max = 3,
  included_audio_langs = 3,
  is_quote_only = false,
  pricing_is_unlimited = false,
  sort_order = 4,
  is_active = true,
  archived_at = NULL
WHERE plan_code = 'ENVERGURE'::public.pricing_plan_code;

-- 3. HORIZON — visiteurs 2000 -> 3000 ; 2 audios
UPDATE public.pricing SET
  pricing_max_visitors = 3000,
  max_visitors_per_month_included = 3000,
  included_audio_langs = 2,
  sort_order = 3
WHERE plan_code = 'HORIZON'::public.pricing_plan_code;

-- 4. ATELIER — 1 langue de médiation / 1 audio (alignement grille validée)
UPDATE public.pricing SET
  included_mediation_langs_min = 1,
  included_mediation_langs_max = 1,
  included_audio_langs = 1,
  sort_order = 2
WHERE plan_code = 'ATELIER'::public.pricing_plan_code;

-- 5. RAYONNEMENT — devient un plan à prix fixe (549 HT = 658,80 TTC)
--    œuvres illimitées, 10 000 visiteurs/mois, 5 langues, 5 audios.
UPDATE public.pricing SET
  pricing_monthly_ttc_eur = 658.80,
  is_quote_only = false,
  pricing_is_unlimited = true,
  pricing_max_oeuvres = NULL,
  max_artworks_included = NULL,
  pricing_max_visitors = 10000,
  max_visitors_per_month_included = 10000,
  included_mediation_langs_min = 5,
  included_mediation_langs_max = 5,
  included_audio_langs = 5,
  sort_order = 5
WHERE plan_code = 'RAYONNEMENT'::public.pricing_plan_code;

-- 6. ZENITH — repoussé en fin de tri
UPDATE public.pricing SET sort_order = 6
WHERE plan_code = 'ZENITH'::public.pricing_plan_code;

-- 7. Remise annuelle « 10 mois pour 12 » (2 mois offerts)
--    pricing_annuel / pricing_annual_remis / éco_annuel sont des colonnes GÉNÉRÉES :
--    on redéfinit leur expression (drop + recreate) — impossible via UPDATE.
--    Ancienne formule : annuel remisé = mensuel * 11 (1 mois offert).
--    Nouvelle formule : annuel remisé = mensuel * 10 (2 mois offerts).
--    Ordre de drop : éco_annuel d'abord (dépend des deux autres).
ALTER TABLE public.pricing DROP COLUMN IF EXISTS "éco_annuel";
ALTER TABLE public.pricing DROP COLUMN IF EXISTS pricing_annual_remis;
ALTER TABLE public.pricing DROP COLUMN IF EXISTS pricing_annuel;

ALTER TABLE public.pricing
  ADD COLUMN pricing_annuel numeric(10,2)
    GENERATED ALWAYS AS (
      CASE
        WHEN pricing_monthly_ttc_eur IS NULL OR pricing_monthly_ttc_eur = 0 THEN NULL
        ELSE round(pricing_monthly_ttc_eur * 12, 2)
      END
    ) STORED,
  ADD COLUMN pricing_annual_remis numeric(10,2)
    GENERATED ALWAYS AS (
      CASE
        WHEN pricing_monthly_ttc_eur IS NULL OR pricing_monthly_ttc_eur = 0 THEN NULL
        ELSE round(pricing_monthly_ttc_eur * 10, 2)
      END
    ) STORED,
  ADD COLUMN "éco_annuel" numeric(10,2)
    GENERATED ALWAYS AS (
      CASE
        WHEN pricing_monthly_ttc_eur IS NULL OR pricing_monthly_ttc_eur = 0 THEN NULL
        ELSE round(pricing_monthly_ttc_eur * 2, 2)
      END
    ) STORED;

-- 8. Options ENVERGURE (langues suppl. + veille)
INSERT INTO public.pricing_options (pricing_id, option_code, billing_mode, unit_price_ttc_eur, description)
SELECT p.pricing_id, o.option_code, o.billing_mode, o.unit_price, o.description
FROM public.pricing p
JOIN (VALUES
  ('EXTRA_MEDIATION_LANG'::public.pricing_option_code, 'monthly_recurring'::public.pricing_option_billing_mode, 15.00::numeric, 'Langue médiation supplémentaire'),
  ('EXTRA_AUDIO_LANG', 'monthly_recurring', 15.00, 'Langue audio-guide supplémentaire'),
  ('STANDBY', 'monthly_recurring', 79.00, 'Plan veille Envergure')
) AS o(option_code, billing_mode, unit_price, description) ON true
WHERE p.plan_code = 'ENVERGURE'::public.pricing_plan_code
ON CONFLICT (pricing_id, option_code) DO UPDATE SET
  unit_price_ttc_eur = EXCLUDED.unit_price_ttc_eur,
  billing_mode = EXCLUDED.billing_mode,
  description = EXCLUDED.description,
  updated_at = now();

-- 9. Règles de dépassement ENVERGURE (œuvres / visiteurs)
INSERT INTO public.pricing_overage_rules (
  pricing_id, metric_code, included_units, pack_size, pack_price_ttc_eur,
  upgrade_recommendation_threshold_artworks,
  upgrade_recommendation_threshold_visitors,
  recommendation_target_plan,
  consecutive_months_for_recommendation,
  billing_active, recommendation_active
)
SELECT p.pricing_id, r.metric_code, r.included_units, r.pack_size, r.pack_price,
       r.art_threshold, r.vis_threshold, r.target_plan, r.consec_months,
       r.billing_active, r.recommendation_active
FROM public.pricing p
JOIN (VALUES
  ('ARTWORKS'::public.overage_metric_code, 1500, 50, 20.00::numeric, 2000, NULL::integer, 'RAYONNEMENT'::public.upgrade_target_plan, NULL::smallint, true, true),
  ('VISITORS', 5000, 500, 5.00, NULL, 12000, 'RAYONNEMENT', 2, true, true)
) AS r(metric_code, included_units, pack_size, pack_price, art_threshold, vis_threshold, target_plan, consec_months, billing_active, recommendation_active) ON true
WHERE p.plan_code = 'ENVERGURE'::public.pricing_plan_code
ON CONFLICT (pricing_id, metric_code) DO UPDATE SET
  included_units = EXCLUDED.included_units,
  pack_size = EXCLUDED.pack_size,
  pack_price_ttc_eur = EXCLUDED.pack_price_ttc_eur,
  upgrade_recommendation_threshold_artworks = EXCLUDED.upgrade_recommendation_threshold_artworks,
  upgrade_recommendation_threshold_visitors = EXCLUDED.upgrade_recommendation_threshold_visitors,
  recommendation_target_plan = EXCLUDED.recommendation_target_plan,
  consecutive_months_for_recommendation = EXCLUDED.consecutive_months_for_recommendation,
  billing_active = EXCLUDED.billing_active,
  recommendation_active = EXCLUDED.recommendation_active,
  updated_at = now();

COMMIT;
