# Inventaire technique A1.6 — AIMEDIArt

| | |
|---|---|
| **Document parent** | Annexe 1 — `aimediart-valorisation-et-pacte-associes-annexes` |
| **Date** | 25 juillet 2026 |
| **Statut** | Brouillon — à joindre le jour de la signature (hors pacte signé) |
| **Règle** | Aucune valeur secrète (clé, mot de passe, token) dans ce fichier |

---

## 1. Dépôt Git — référence figée

| Élément | Valeur |
|---------|--------|
| Plateforme | GitHub |
| URL du dépôt | `https://github.com/fadu57/aimediart-creations-main` |
| Branche de référence | `main` |
| **Tag de valorisation** | `valo-2026-07-25` |
| **Hash du commit (complet)** | `[coller le résultat de git rev-parse HEAD]` |
| **Hash court** | `[coller le résultat de git rev-parse --short HEAD]` |
| Accès lecture associés B/C / conseil | ☐ Compte GitHub en lecture seule sur le dépôt privé ☐ Archive ZIP du tag (sans `.env`) |

**Commandes (à exécuter une fois, depuis la racine du repo) :**

```bash
git checkout main
git pull origin main
git tag -a valo-2026-07-25 -m "Référence valorisation AIMEDIArt — 25 juillet 2026"
git push origin valo-2026-07-25
git rev-parse HEAD
git rev-parse --short HEAD
```

Sous PowerShell, pour coller directement hash + tag dans un fichier note :

```powershell
git checkout main
git pull origin main
git tag -a valo-2026-07-25 -m "Référence valorisation AIMEDIArt — 25 juillet 2026"
git push origin valo-2026-07-25
"Tag: valo-2026-07-25" | Out-File -Encoding utf8 docs\note-git-valo.txt
"Hash: $(git rev-parse HEAD)" | Add-Content -Encoding utf8 docs\note-git-valo.txt
"Short: $(git rev-parse --short HEAD)" | Add-Content -Encoding utf8 docs\note-git-valo.txt
Get-Content docs\note-git-valo.txt
```

---

## 2. Inventaire hébergement & facturation

### 2.1 Vercel (front / site)

| Élément | À compléter |
|---------|-------------|
| Compte / équipe | `[email du owner Vercel]` |
| Nom du projet | `[ex. aimediart-creations-main]` |
| URL de production | `https://www.aimediart.com` (et aliases éventuels) |
| Compte de facturation | ☐ Perso (porteur) ☐ Société `[dénomination]` — à régulariser au profit de la Société |
| Carte / moyen de paiement | `[titulaire]` |
| Environnements | Production / Preview / Development |

### 2.2 Supabase (base, auth, storage, Edge Functions)

| Élément | À compléter |
|---------|-------------|
| Organisation / compte | `[email du owner Supabase]` |
| Référence projet | `ladhkvghtnzpnqolxybb` (Dashboard → Settings → General) |
| URL API | `https://ladhkvghtnzpnqolxybb.supabase.co` |
| Région | `[ex. West EU — à confirmer dans le dashboard]` |
| Compte de facturation | ☐ Perso ☐ Société |
| Plan | `[Free / Pro / …]` |

### 2.3 Nom de domaine

| Élément | À compléter |
|---------|-------------|
| Domaine(s) | `aimediart.com`, `www.aimediart.com` |
| Registrar | `[OVH / autre]` |
| Titulaire WHOIS / compte | `[email / identité]` |
| DNS / MX | `[ex. ImprovMX pour réception mail]` |
| Transfert prévu vers la Société | ☐ Oui ☐ Non ☐ Plus tard |

### 2.4 Autres comptes cloud liés au produit (si applicables)

| Service | Compte / projet | Facturation | Notes |
|---------|-----------------|-------------|-------|
| Resend (e-mails) | `[…]` | `[…]` | Expéditeur `no-reply@aimediart.com` |
| Groq / Gemini / OpenAI | `[…]` | `[…]` | Clés côté Edge Functions |
| OVH (API coûts / serveur) | `[…]` | `[…]` | |
| Google Cloud (billing / TTS) | `[…]` | `[…]` | |
| GitHub | `fadu57/aimediart-creations-main` | — | |
| Autre | `[…]` | `[…]` | |

---

## 3. Inventaire des secrets / clés (noms uniquement)

**Où stocker les valeurs :** gestionnaire de mots de passe (Bitwarden / 1Password) partagé ou coffre notaire — **jamais** dans le pacte, ni dans Git.

### 3.1 Front (Vite / Vercel — variables `VITE_*`)

| Nom | Emplacement typique | Nature |
|-----|---------------------|--------|
| `VITE_SUPABASE_URL` | `.env` local + Vercel Env | URL publique projet |
| `VITE_SUPABASE_ANON_KEY` | idem | Clé anon (publique côté client) |
| `VITE_PUBLIC_SITE_URL` | idem | URL site (auth redirects) |
| `VITE_PUBLIC_URL` | optionnel | Variante URL publique |
| `VITE_DEFAULT_AGENCY_ID` | optionnel / dev | UUID agence défaut |
| `VITE_DEFAULT_EXPO_ID` | optionnel / dev | UUID expo défaut |
| `VITE_SUPABASE_ARTIST_PHOTOS_BUCKET` | optionnel | Nom bucket Storage |
| `VITE_XAI_API_KEY` | optionnel (à éviter en prod front) | Clé xAI |
| `VITE_LEGAL_CGV_URL` | optionnel | Lien CGV externe |
| `VITE_LEGAL_RGPD_URL` | optionnel | Lien RGPD externe |
| `VITE_AUDIO_GEN_CONCURRENCY` | optionnel | Réglage technique |
| `VITE_CLIENT_ERROR_LOGGING` | optionnel | Flag logging |

### 3.2 Local / scripts (racine `.env` — ne pas committer)

| Nom | Usage |
|-----|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Scripts admin / backup (très sensible) |
| `SUPABASE_DB_PASSWORD` / `SUPABASE_DB_URL` | Dump SQL / backups |
| `GROQ_API_KEY` | Scripts / outils locaux |
| `HF_TOKEN` | Génération avatars (Hugging Face) |
| `EMAIL_USER` / `EMAIL_APP_PASSWORD` | Scripts mail (ex. avatars) |
| `GITHUB_PAT` | Scripts GitHub locaux |
| `AVATAR_NOTIFY_EMAIL` | Notification scripts |
| `VERCEL_OIDC_TOKEN` | Présent en local tooling (`.env.local`) — ne pas versionner |

### 3.3 Supabase Edge Functions (Secrets Dashboard / `supabase secrets`)

| Nom | Famille |
|-----|---------|
| `SUPABASE_URL` | Infra (souvent auto) |
| `SUPABASE_ANON_KEY` | Infra |
| `SUPABASE_SERVICE_ROLE_KEY` | Infra (critique) |
| `APP_URL` / `SITE_URL` | URLs appli |
| `RESEND_API_KEY` | E-mails |
| `RESEND_FROM` / `RESEND_FROM_EMAIL` / `NOTIFY_FROM_EMAIL` | Expéditeur |
| `ADMIN_EMAIL` / `QUOTE_NOTIFY_EMAIL` / `COST_SPIKE_ALERT_EMAIL` | Destinataires alertes |
| `GROQ_API_KEY` / `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `OPENAI_API_KEY` | IA |
| `GOOGLE_TTS_API_KEY` | TTS |
| `HF_TOKEN` | Modèles HF |
| `GITHUB_TOKEN` / `GITHUB_REPO_OWNER` / `GITHUB_REPO_NAME` / `GITHUB_BRANCH` | Stats Git |
| `WAKATIME_API_KEY` | Suivi temps |
| `VERCEL_API_TOKEN` / `VERCEL_PROJECT_NAME` / `VERCEL_TEAM_ID` | Sync coûts Vercel |
| `OVH_APP_KEY` / `OVH_APP_SECRET` / `OVH_CONSUMER_KEY` / `OVH_ENDPOINT` | Sync coûts OVH |
| `GOOGLE_CLOUD_PROJECT_ID` / `GOOGLE_BILLING_*` | Billing GCP |
| `IMPROVMX_API_KEY` | Mail réception (si utilisé) |
| `SB_MGMT_ACCESS_TOKEN` | Management API Supabase |
| Autres optionnels IA | `GEMINI_MEDIATION_MODEL`, `GROQ_DEFAULT_BIO_MODEL`, `COST_SPIKE_THRESHOLD_PCT`, etc. |

### 3.4 Mentions à faire dans l’inventaire (cases)

- [ ] Liste des **noms** ci-dessus jointe (ce document)
- [ ] Valeurs conservées hors pacte (Bitwarden / coffre) au nom de : `[Porteur / Société]`
- [ ] Engagement de **transfert** des comptes et secrets au profit de la Société après constitution
- [ ] Rotation des clés prévue après apport / ouverture du capital : ☐ Oui ☐ Non

---

## 4. Signatures de prise de connaissance (optionnel)

Les soussignés reconnaissent avoir pris connaissance du présent inventaire technique (noms et emplacements uniquement, sans valeurs secrètes).

| Associé | Nom | Date | Signature |
|---------|-----|------|-----------|
| A | DUPONT Fabien | | |
| B | | | |
| C | | | |
