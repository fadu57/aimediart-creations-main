## generate-mediation

Edge Function Supabase qui appelle Groq de manière sécurisée.

### Variables d'environnement

- `GROQ_API_KEY` (obligatoire)

### Déploiement

```bash
supabase functions deploy generate-mediation
```

### Test local

```bash
supabase functions serve generate-mediation --no-verify-jwt
```

### Body attendu (POST)

```json
{
  "source_text": "Texte source de l'œuvre...",
  "styles": [
    { "id": "enfant", "label": "Enfant", "max_tokens": 500 },
    { "id": "expert", "label": "Expert", "max_tokens": 700 }
  ]
}
```

### Réponse

```json
{
  "enfant": "...",
  "expert": "..."
}
```

