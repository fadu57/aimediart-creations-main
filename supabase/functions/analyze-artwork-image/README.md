## analyze-artwork-image

Edge Function Supabase pour analyser une photo d'œuvre via Gemini 1.5 Flash.

### Prompt (texte envoyé à Gemini)

Ordre (première source non vide) :

1. `app_settings` **`key` = `Analyse de l'image`** — la colonne **`value`** est le prompt brut (placeholder **`{{artist_name}}`** possible).
2. Sinon `app_settings` **`key` = `analysis_prompt`** (historique).
3. Sinon ligne **`prompt_style`** dont le **name** correspond à « Analyse de l'image » (concaténation `persona_identity`, `style_rules`, `system_instruction`). `max_tokens` pilote la sortie Gemini (256–4096).
4. Sinon modèle par défaut dans le code.

### Variables d'environnement

- `GEMINI_API_KEY` (obligatoire)

### Déploiement

```bash
supabase functions deploy analyze-artwork-image
```

### Requête POST (exemple)

```json
{
  "image_url": "https://.../public/artwork-images/artworks/....jpg",
  "artist_name": "Salvador Dali"
}
```

### Réponse

```json
{ "notes": "..." }
```

