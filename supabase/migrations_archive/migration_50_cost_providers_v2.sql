-- migration_50_cost_providers_v2.sql
-- Amélioration du modèle cost_providers :
--   - colonne actively_used (fournisseur réellement utilisé ≠ juste configuré)
--   - nouveau statut 'configured_not_used' dans la contrainte CHECK
--   - commentaires mis à jour

-- 1. Ajouter la colonne actively_used
alter table public.cost_providers
  add column if not exists actively_used boolean not null default false;

comment on column public.cost_providers.actively_used is
  'True si le fournisseur est détecté dans les logs de consommation récents (ai_usage_events ou ai_usage_logs). Un secret présent ne suffit pas.';

comment on column public.cost_providers.configured is
  'True si la clé API / variable d''environnement est présente côté Edge Function. Ne signifie pas que le fournisseur est réellement utilisé.';

comment on column public.cost_providers.detected_in_code is
  'True si le fournisseur est référencé dans le registre applicatif (providerRegistry.ts). Indépendant de la configuration.';

-- 2. Étendre la contrainte CHECK sur status pour inclure 'configured_not_used'
--    (un fournisseur configuré mais sans usage récent détecté)
alter table public.cost_providers
  drop constraint if exists cost_providers_status_check;

alter table public.cost_providers
  add constraint cost_providers_status_check
    check (status in (
      'active',                  -- configuré ET activement utilisé
      'configured_not_used',     -- configuré, secret présent, mais pas vu dans les logs
      'inactive',                -- désactivé manuellement
      'unknown',                 -- état inconnu (avant première analyse)
      'error',                   -- dernière opération en erreur
      'detected_not_configured'  -- connu du registre mais secret absent
    ));

-- 3. Index utile pour les requêtes "fournisseurs actifs"
create index if not exists cost_providers_actively_used_idx on public.cost_providers (actively_used);
