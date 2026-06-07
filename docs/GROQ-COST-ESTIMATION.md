# Coûts Groq — estimation depuis `ai_usage_logs`

Groq ne fournit **pas d'API de facturation** exploitable dans ce projet. La sync calcule des **coûts estimés** à partir des logs existants.

## Source de données

Table `ai_usage_logs`, alimentée par les Edge Functions :

- `generate-mediation` (provider = `groq`)
- `generate-artist-bio` (si Groq)
- `ai-worker` (`generate_fiche`, `translate_fiche` — metadata : `job_type`, `source_function`)
- autres appels loggés via `insertAiUsageLog`

Colonnes utilisées : `model_id`, `prompt_tokens`, `completion_tokens`, `created_at`, `metadata` (optionnel).

## Méthode

1. Lire les logs `provider = 'groq'` sur la période demandée.
2. Appliquer la grille tarifaire USD/M tokens codée dans `groqCostEstimator.ts`.
3. Insérer dans `ai_usage_events` avec `import_hash = groq_log:{id}` (idempotent).

## Limites

- Montants **indicatifs** (USD), pas la facture réelle.
- Modèles non listés dans la grille → tarif fallback conservateur.
- Si Groq ne renvoie pas `usage` : ligne loggée avec tokens à 0 et `metadata.usage_missing = true`.

## Lancer une sync

```json
POST /functions/v1/providers-sync-costs
{ "provider_key": "groq", "mode": "incremental", "days": 30 }
```

Backfill :

```json
{ "provider_key": "groq", "mode": "backfill", "date_from": "2025-01-01", "date_to": "2025-12-31" }
```

Mettre à jour les tarifs : `supabase/functions/_shared/groqCostEstimator.ts` (réf. https://console.groq.com/docs/pricing).
