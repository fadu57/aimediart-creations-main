# Archive — migrations et scripts RLS obsolètes (AIM-173)

Ce dossier n'est **pas** rejoué par le CLI Supabase (`supabase start` / `supabase db reset`
ne lisent que `supabase/migrations/`). Son unique rôle est de préserver l'historique.

## Contenu

- **74 fichiers `migration_NN_*.sql`** : ancien format de nommage, non conforme au format
  attendu par le CLI Supabase (`<timestamp 14 chiffres>_nom.sql`). Sur une base vierge
  (CI, nouveau volume Docker), ces fichiers étaient silencieusement ignorés, ce qui rendait
  un cold start incapable de reconstruire le schéma complet (tables de base manquantes,
  provoquant l'échec bloquant de `20260612110000_visitor_expo_visits_prerequisites.sql`
  entre autres).
- **`rls_final_referentiel.sql`** et **`rls_security_fix.sql`** : scripts SQL exécutés à la
  main (hors mécanisme de migrations), obsolètes — `rls_security_fix.sql` (03/05/2026) fait
  déjà un `DROP ... CASCADE` puis recrée les fonctions RLS définies par
  `rls_final_referentiel.sql`. Le dump prod utilisé pour la baseline fait désormais foi sur
  l'état réel de ces fonctions.

## Remplacement

Tous ces fichiers sont remplacés par une baseline unique :
`supabase/migrations/20260101000000_baseline_schema.sql`, générée à partir d'un dump prod
via `scripts/build-baseline-migration.mjs`. Voir le ticket AIM-173.

## Ce qui n'est pas concerné

`supabase/sql/` reste actif et n'est pas archivé : c'est une convention distincte (copies
exécutables à la main dans le SQL Editor Supabase), pas des migrations trackées.
