-- migration_63_fix_picasso_birth_date.sql
-- Pablo Picasso : naissance enregistrée en 1981 au lieu de 1881 (décès 1973-04-08).
-- Tant que naissance > décès, le calcul d'âge renvoie null.

BEGIN;

UPDATE public.artists
SET artist_birth_date = '1881-10-25'
WHERE artist_id = '8d16eb6c-41a3-4517-9d25-acde991217f4'
  AND artist_birth_date = '1981-10-24'
  AND artist_death_date = '1973-04-08';

COMMIT;
