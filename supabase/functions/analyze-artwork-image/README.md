## analyze-artwork-image

Edge Function Supabase pour analyser une photo d'œuvre via Gemini (bouton **Analyser l'image avec l'IA**).

### Prompt (source unique)

Ordre (première source non vide) :

1. `app_settings` **`key` = `Analyse de l'image`** — colonne **`value`** = prompt (placeholders **`{{artist_name}}`**, **`{{artwork_name}}`**). **`max_tokens`** = plafond de sortie Gemini (256–4096).
2. Sinon `app_settings` **`key` = `analysis_prompt`** (historique).
3. Sinon modèle par défaut dans le code.

**`prompt_style` n'est pas utilisé** pour cette fonction (réservé aux médiations).

### Gemini 2.5 et troncature

Sur **Gemini 2.5 Flash**, les tokens de *réflexion* comptaient par défaut dans `maxOutputTokens`, ce qui laissait très peu de place au texte visible. La fonction fixe `thinkingConfig: { thinkingBudget: 0 }` pour consacrer tout le plafond au texte de l'analyse.

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
