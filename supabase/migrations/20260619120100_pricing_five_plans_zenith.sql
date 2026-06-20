-- Zénith — grand événement sur mesure (sur devis)
-- Rayonnement : données tarifaires gérées directement en base (ne pas écraser ici).
INSERT INTO public.pricing (
  pricing_label,
  pricing_plan,
  plan_code,
  display_name,
  pricing_monthly_ttc_eur,
  pricing_max_oeuvres,
  pricing_max_visitors,
  max_artworks_included,
  max_visitors_per_month_included,
  standby_monthly_price_ttc_eur,
  included_mediation_langs_min,
  included_mediation_langs_max,
  included_audio_langs,
  trial_duration_days,
  is_quote_only,
  pricing_is_unlimited,
  sort_order,
  is_active
)
SELECT
  'LE ZÉNITH',
  'ZENITH',
  'ZENITH'::public.pricing_plan_code,
  'Zénith',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  true,
  true,
  5,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.pricing p WHERE p.plan_code = 'ZENITH'::public.pricing_plan_code
);

UPDATE public.pricing
SET
  pricing_label = 'LE ZÉNITH',
  pricing_plan = 'ZENITH',
  display_name = 'Zénith',
  pricing_monthly_ttc_eur = NULL,
  pricing_max_oeuvres = NULL,
  pricing_max_visitors = NULL,
  max_artworks_included = NULL,
  max_visitors_per_month_included = NULL,
  is_quote_only = true,
  pricing_is_unlimited = true,
  sort_order = 5,
  is_active = true,
  archived_at = NULL
WHERE plan_code = 'ZENITH'::public.pricing_plan_code;

COMMENT ON COLUMN public.pricing.plan_code IS
  'Clé canonique du plan (ETINCELLE, ATELIER, HORIZON, RAYONNEMENT, ZENITH).';
