## generate-mediation

Edge Function Supabase : génération des textes de médiation (plusieurs personas / styles) via **Google Gemini** ou **Groq** selon `selected_ai_model`.

Le modèle utilisé est lu dans `public.app_settings` (`key = selected_ai_model`), avec repli sur la variable d’environnement `GEMINI_MEDIATION_MODEL`, puis valeur par défaut `gemini-2.5-pro-preview-05-06` (à adapter selon votre offre API, y compris modèles preview type raisonnement profond).

Après un appel réussi, une ligne est insérée dans `ai_usage_logs` (tokens dérivés de `usageMetadata` pour `generateContent`, de `usage` / `usageMetadata` pour l’API Interactions Deep Research après la fin du job — refetch si vide).

### Variables d’environnement

- `GEMINI_API_KEY` (si le modèle actif est Gemini / Deep Research)
- `GROQ_API_KEY` (si le modèle actif est Groq)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (obligatoires — lecture du modèle actif et journal `ai_usage_logs`)
- `GEMINI_MEDIATION_MODEL` (optionnel — priorité **après** `selected_ai_model` en base)
- Deep Research (optionnel) : `GEMINI_DEEP_RESEARCH_MAX_POLLS`, `GEMINI_DEEP_RESEARCH_POLL_MS`, `GEMINI_INTERACTION_USAGE_EXTRA_GETS`

### Déploiement

Le module partagé `_shared/ai_usage_log.ts` est résolu automatiquement par la CLI :

```bash
supabase functions deploy generate-mediation
```

Idem pour les autres fonctions modifiées (`analyze-artwork-image`, `generate-artist-bio`) si vous redéployez tout le périmètre consommation tokens.
### Body attendu (POST)

```json
{
  "source_text": "Texte source de l'œuvre...",
  "lang": "fr",
  "styles": [
    { "id": "enfant", "label": "Enfant", "max_tokens": 500 },
    { "id": "expert", "label": "Expert", "max_tokens": 700 }
  ]
}
```

### Réponse (200)

```json
{
  "analyse_globale": "Raisonnement structuré du modèle (phase d’analyse)…",
  "styles": {
    "enfant": "…",
    "expert": "…"
  }
}
```

L’objet `styles` contient **exactement** les mêmes clés `id` que la requête.  
Le champ `analyse_globale` est produit à partir du JSON interne du modèle (`analyse_et_reflexion`).
