# Export PDF statistiques (Playwright / Chromium)

Ce dossier contient un **petit serveur Express** qui utilise **Playwright** pour ouvrir la page `/statistiques` dans Chromium, attendre le rendu (données + graphiques), puis appeler **`page.pdf()`**.  
Aucun html2canvas ni capture canvas côté navigateur.

## Prérequis

1. **Node.js** 18+
2. **Chromium** pour Playwright (une fois par machine) :

```bash
npx playwright install chromium
```

3. Fichier **`.env`** à la racine du projet (comme pour Vite), avec au minimum :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Le serveur PDF lit les mêmes variables (`VITE_*` ou `SUPABASE_URL` / `SUPABASE_ANON_KEY`).

Variables optionnelles :

| Variable | Défaut | Rôle |
|----------|--------|------|
| `PDF_EXPORT_ORIGIN` | `http://localhost:8080` | URL où tourne l’app (Vite) |
| `PDF_SERVER_PORT` | `3847` | Port du serveur PDF |
| `PDF_SERVER_HOST` | `127.0.0.1` | Écoute (restez en local sauf besoin avancé) |
| `PDF_EXPORT_CORS_ORIGINS` | localhost:8080 + 127.0.0.1:8080 | Origines autorisées pour `fetch` depuis le navigateur |

## Lancer le serveur PDF (local)

**Recommandé — une seule commande** (Vite sur le port 8080 + serveur PDF sur 3847) :

```bash
npm run dev:all
```

Sinon **deux terminaux** :

```bash
npm run dev
npm run pdf-server
```

Le fichier `vite.config.ts` expose un **proxy** : en développement, l’app appelle `/pdf-export/...` sur le même origine (`localhost:8080`) et Vite redirige vers `http://127.0.0.1:3847`. **Inutile** de définir `VITE_PDF_EXPORT_URL` pour du local standard.

Si le serveur PDF tourne sur une autre machine ou un autre port, définissez :

```env
VITE_PDF_EXPORT_URL=http://127.0.0.1:3847
```

(ou l’URL complète du service PDF),

## Tester

1. Connectez-vous au back-office, ouvrez **Statistiques**, ouvrez l’aperçu puis **Générer le PDF**.
2. Ou appelez directement le serveur (session JSON Supabase) avec `curl` / Postman — voir `POST /export/statistics-pdf` (corps : `{ "session": { ... }, "paperFormat": "a4" }`).

Healthcheck : `GET http://127.0.0.1:3847/health`

## Production (Vercel — www.aimediart.com)

Le déploiement Vercel inclut une **fonction serverless** `api/export/statistics-pdf.ts` (Chromium via `@sparticuz/chromium`).  
L’app appelle `/pdf-export/export/statistics-pdf` ; `vercel.json` redirige vers cette API.

**Variables à définir dans le projet Vercel** (Settings → Environment Variables) :

| Variable | Exemple | Rôle |
|----------|---------|------|
| `VITE_SUPABASE_URL` | (déjà pour le build) | Auth session pour l’export |
| `VITE_SUPABASE_ANON_KEY` | (déjà pour le build) | Idem |
| `PDF_EXPORT_ORIGIN` | `https://www.aimediart.com` | URL que Chromium ouvre pour le rendu (`/statistiques?chromiumPdf=1`) |

Sans `PDF_EXPORT_ORIGIN`, Vercel utilise l’URL de déploiement (`VERCEL_URL`), qui peut différer du domaine custom.

Après modification : **redéployer** le projet. Plan Vercel **Pro** recommandé (fonction jusqu’à 120 s, 3 Go RAM).

En secours, si l’API échoue, l’app propose l’**impression navigateur** (Ctrl+P → Enregistrer en PDF).

## Sécurité production

- L’endpoint accepte une session utilisateur et génère un PDF avec les droits de cet utilisateur — ne pas l’exposer sans auth côté app.
- En local, gardez le serveur Express sur **127.0.0.1** sauf besoin avancé.
