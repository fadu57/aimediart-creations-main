-- Correctif seed migration 79 : included_audio_langs NOT NULL (Rayonnement ne doit pas recevoir NULL)

UPDATE public.pricing
SET included_audio_langs = COALESCE(included_audio_langs, 0)
WHERE plan_code = 'RAYONNEMENT'::public.pricing_plan_code
   OR upper(pricing_plan) LIKE '%RAYONNEMENT%';
