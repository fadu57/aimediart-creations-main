-- Ajout du palier ENVERGURE à l'enum (transaction séparée requise avant usage).
-- Position : entre HORIZON et RAYONNEMENT.

ALTER TYPE public.pricing_plan_code ADD VALUE IF NOT EXISTS 'ENVERGURE' AFTER 'HORIZON';

-- Cible de recommandation d'upgrade (ATELIER / HORIZON / RAYONNEMENT) — on autorise ENVERGURE.
ALTER TYPE public.upgrade_target_plan ADD VALUE IF NOT EXISTS 'ENVERGURE' AFTER 'HORIZON';
