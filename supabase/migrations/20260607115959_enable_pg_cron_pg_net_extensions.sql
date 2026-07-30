-- Amorçage des extensions requises par les migrations cron (pg_cron, pg_net).
-- Sur les projets Supabase hébergés existants, ces extensions ont été activées
-- manuellement via le dashboard (cf. commentaires des migrations *_cron_*.sql) :
-- cette migration est donc un no-op idempotent sur ces environnements.
-- Nécessaire pour toute base rejouée à froid (CI, nouveau `supabase start` local)
-- où ces migrations n'avaient jamais été réellement exécutées avant AIM-30
-- (le job CI tenant-isolation était un no-op silencieux jusqu'ici).
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

COMMIT;
