-- AIM-173 — authenticated n'avait aucun GRANT SELECT sur public.audio_files.
-- Sans ce GRANT, npm run test:tenant-isolation échoue sur toute base reconstruite
-- à froid (le RLS filtre les lignes mais la table doit d'abord être accessible
-- en lecture au niveau GRANT). Finding sécurité découvert pendant AIM-173 :
-- aucune migration trackée par Git n'accordait jamais ce SELECT.
GRANT SELECT ON public.audio_files TO authenticated;
