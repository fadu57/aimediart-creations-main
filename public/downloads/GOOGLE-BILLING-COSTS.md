# Coûts Google Gemini via Cloud Billing Export → BigQuery

Guide pas à pas pour connecter la facturation GCP à `/settings/couts`.  
**Public cible :** administrateur sans expertise GCP.

---

## Vue d'ensemble

| Étape | Où ? | Automatisé par l'app ? |
|-------|------|------------------------|
| Projet GCP + facturation active | Console Google Cloud | Non |
| Export facturation → BigQuery | Console Billing | Non |
| Compte de service + clé JSON | Console IAM | Non |
| Secrets dans Supabase | Dashboard Supabase | Non |
| Requête BigQuery + import coûts | Edge Function `providers-sync-costs` | **Oui** |

**Code prêt :** `googleBilling.ts`, `googleAuth.ts`, anti-doublons via `import_hash`.

---

## Étape 1 — Projet Google Cloud

1. Ouvrir [console.cloud.google.com](https://console.cloud.google.com/)
2. Menu ☰ → **IAM et administration** → **Paramètres du projet**
3. Noter l'**ID du projet** (ex. `mon-projet-123456`) → secret `GOOGLE_CLOUD_PROJECT_ID`
4. Vérifier qu'une **facturation** est liée : menu ☰ → **Facturation** → le projet doit apparaître avec un compte actif

> Si vous n'avez pas de compte de facturation : **Facturation** → **Gérer les comptes de facturation** → créer ou lier un compte.

---

## Étape 2 — Activer BigQuery

1. [console.cloud.google.com/apis/library/bigquery.googleapis.com](https://console.cloud.google.com/apis/library/bigquery.googleapis.com)
2. Sélectionner votre projet en haut
3. Cliquer **Activer**

---

## Étape 3 — Export Cloud Billing vers BigQuery

1. Ouvrir [console.cloud.google.com/billing](https://console.cloud.google.com/billing)
2. Sélectionner le **compte de facturation** lié à votre usage Gemini
3. Menu gauche → **Export de la facturation** (Billing export)
4. Onglet **Export BigQuery** → **Modifier les paramètres** ou **Configurer l'export**
5. Choisir :
   - **Detailed usage cost data** (recommandé — détail par SKU)
   - Projet GCP cible : le même que ci-dessus
   - Dataset : ex. `billing_export` (créé automatiquement si absent)
6. Enregistrer et attendre **24–48 h** pour les premières lignes

### Retrouver le nom de la table

1. [console.cloud.google.com/bigquery](https://console.cloud.google.com/bigquery)
2. Panneau gauche : projet → dataset `billing_export`
3. Table du type :
   - `gcp_billing_export_resource_v1_XXXXXX_XXXXXX_XXXXXX`
   - ou `gcp_billing_export_v1_XXXXXX_XXXXXX_XXXXXX`
4. Noter :
   - **Dataset** → `GOOGLE_BILLING_BQ_DATASET`
   - **Nom de table** (sans backticks) → `GOOGLE_BILLING_BQ_TABLE`

---

## Étape 4 — Compte de service (lecture seule BigQuery)

1. [console.cloud.google.com/iam-admin/serviceaccounts](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. **Créer un compte de service**
   - Nom : `billing-cost-sync`
   - ID : `billing-cost-sync`
3. **Créer une clé** :
   - Onglet **Clés** → **Ajouter une clé** → **Créer une clé** → **JSON**
   - Télécharger le fichier `.json` (ne pas le committer dans Git)

### Droits IAM

Sur le **projet** (IAM → Accorder l'accès) :

| Rôle | Pourquoi |
|------|----------|
| `BigQuery Job User` (`roles/bigquery.jobUser`) | Lancer la requête |
| `BigQuery Data Viewer` (`roles/bigquery.dataViewer`) | Lire le dataset d'export |

> Variante plus stricte : accorder `Data Viewer` uniquement sur le dataset `billing_export`.

---

## Étape 5 — Secrets Supabase Edge Functions

1. [supabase.com/dashboard](https://supabase.com/dashboard) → votre projet
2. **Project Settings** → **Edge Functions** → **Secrets** (ou **Environment variables**)
3. Ajouter **exactement** ces secrets :

| Secret | Exemple | Description |
|--------|---------|-------------|
| `GOOGLE_CLOUD_PROJECT_ID` | `mon-projet-123456` | ID du projet GCP |
| `GOOGLE_BILLING_BQ_DATASET` | `billing_export` | Dataset BigQuery |
| `GOOGLE_BILLING_BQ_TABLE` | `gcp_billing_export_resource_v1_01A2B3_01A2B3_01A2B3` | Nom complet de la table |
| `GOOGLE_BILLING_SERVICE_ACCOUNT_JSON` | `{"type":"service_account",...}` | **Contenu entier** du fichier JSON (une seule ligne ou multiligne) |

**Aucun autre secret n'est requis** pour le connecteur billing actuel.

> `GEMINI_API_KEY` sert aux appels IA, pas à la lecture billing. Les deux coexistent.

### Vérification

Dans `/settings/couts` → carte **Google Gemini** :
- badge **Configuration GCP requise** disparaît après analyse + secrets valides
- bouton **Backfill** ou **Re-sync** disponible

---

## Lien GEMINI_API_KEY ↔ facturation BigQuery

L'app appelle Gemini via `GEMINI_API_KEY` (Google AI Studio).  
Les lignes BigQuery n'apparaissent **que si** cette consommation est facturée sur le **même compte de facturation** exporté.

| Situation | Résultat sync |
|-----------|---------------|
| Clé AI Studio + export billing sur le même compte GCP | Coûts importés |
| Clé gratuite / autre compte sans export | **0 ligne** (normal, pas un bug) |
| Export récent (< 48 h) | Dataset peut être vide |

---

## Google TTS dans cette application

| Canal | Technologie | Coût GCP ? |
|-------|-------------|------------|
| TTS visiteur (`VisitorView`, `useTextToSpeechWithVoices`) | **Web Speech API** navigateur | **Non** |
| Cloud Text-to-Speech serveur | **Non utilisé** dans le code actuel | N/A |

→ Le fournisseur `google_tts` est affiché avec le mode **Web Speech (navigateur, sans coût GCP)**.  
Aucune sync billing n'est proposée pour ce fournisseur dans l'UI.

---

## Lancer une sync

### Depuis l'UI (`/settings/couts`)

- **Re-sync** : 7 derniers jours (incrémental)
- **Backfill** (carte Gemini) : plage `date_from` / `date_to` + presets 7j / 30j / 90j

### Via API (session admin)

```json
POST /functions/v1/providers-sync-costs
{
  "provider_key": "google_gemini",
  "mode": "backfill",
  "date_from": "2025-01-01",
  "date_to": "2025-12-31"
}
```

---

## Anti-doublons (`import_hash`)

Chaque ligne billing reçoit un hash stable :

```
google_billing:{provider}:{project_id}:{sku_id}:{usage_start}:{usage_end}:{region}:{cost}:{currency}
```

Réimport = ignoré (contrainte unique sur `ai_usage_events.import_hash`).

---

## Mapping fournisseurs

| Libellé billing (service / SKU) | `provider` dans `ai_usage_events` |
|--------------------------------|-------------------------------------|
| Generative Language, Gemini, Vertex generative | `google_gemini` |
| Cloud Text-to-Speech | `google_tts` (si un jour utilisé côté serveur) |
| Autre | ignoré |

---

## Dépannage rapide

| Symptôme | Cause probable |
|----------|----------------|
| « Prérequis Google Billing manquants » | Secrets Supabase incomplets |
| « BigQuery query failed (403) » | Rôles IAM manquants sur le compte de service |
| « 0 ligne(s) mappée(s) » | Période sans coût Gemini, ou clé AI Studio hors compte exporté |
| Table introuvable | Mauvais `GOOGLE_BILLING_BQ_TABLE` ou export pas encore créé |
