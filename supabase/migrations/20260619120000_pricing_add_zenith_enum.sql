-- Ajout du plan ZENITH à l'enum (transaction séparée requise avant usage).

ALTER TYPE public.pricing_plan_code ADD VALUE IF NOT EXISTS 'ZENITH';
