# Rapport — Modifications page Coûts (`/settings/couts`)

**Date :** 28 juillet 2026  
**Projet :** AIMEDIArt  
**Objet :** Synthèse des évolutions de la page Settings **Coûts** (`SettingsCouts`), y compris le dernier lot de modifications du working tree.

---

## 1. Localisation & accès

| Élément | Détail |
|---|---|
| **Route** | `/settings/couts` |
| **Composant** | `src/pages/SettingsCouts.tsx` |
| **Menu** | Settings → **Suivis** → « Coûts » (`SettingsMenuDropdown` / `SUIVI_LINKS`) |
| **Matrice** | Clé `page_settings_couts` dans `navigationMatrix.ts` |
| **Retour** | Lien « Paramètres » → `/settings` |

**Écriture / saisie manuelle :** admins globaux `role_id` **1–2** (`is_cost_admin()` côté Supabase + garde UI).  
**Carte réconciliation OpenAI TTS :** réservée au `role_id === 1`.

---

## 2. Rôle de la page

Page unique **sans onglets**, scroll vertical, qui compile :

1. **KPI** (barre sticky) : coût total, nombre d’appels, coût moyen, top fournisseur — Edge `get-cost-kpi`
2. **Alertes d’intégrité** (`costIntegrity.ts`)
3. **Filtres** : dates, type d’outil, fournisseur, opération, modèle, statut, œuvre / expo / agence, langues médiation, pré-immatriculation, associé payeur
4. **Tableau détaillé** des événements de coûts + totaux filtrés + tri + pagination + export CSV
5. **Actions admin** : ajout / édition de coûts manuels, pièces jointes, bulk « société en formation », bulk catégorie
6. **Export « État des actes »** (pré-immatriculation) — PDF impression / Markdown (`preIncorporationReport.ts`)
7. **Graphiques** : évolution journalière + répartition fournisseurs (Recharts)
8. **OpenAI TTS** — réconciliation mensuelle (admin 1)
9. **Google Billing** — `GoogleBillingCard`
10. **Inventaire fournisseurs** — sync, plans Cursor / Supabase / Vercel, OVH, backfill Groq/Gemini, etc.

Page sœur tokens : `/suivi_tokens` (réutilise une partie des clés i18n `couts.*`).

---

## 3. Sources de données

| Source | Usage |
|---|---|
| `ai_usage_events` | Source principale (API + sync + `source = 'manual_entry'`) |
| `ai_usage_logs` | Logs non synchronisés → lignes **synthétiques** `usage_log:…` (lecture seule) |
| `cost_providers` | Inventaire fournisseurs |
| `profiles` | Associés « payé par » + rapport pré-immat. |
| `artworks`, `expos`, `agencies`, `artists`, … | Métadonnées / filtres |
| `google_billing_cache` | Budgets GCP |
| RPC | `get_ai_usage_cost_rollup`, `count_ai_usage_events` |
| Storage | Bucket privé **`cost-documents`** (URLs signées 1 h) |
| Edges | `get-cost-kpi`, sync providers / Cursor / Supabase / Vercel / Google Billing, etc. |

Helper RLS : `public.is_cost_admin()` — JWT `app_metadata.role_id IN (1, 2)`.

Coûts manuels : insert/update dans `ai_usage_events` avec métadonnées `manual`, `label`, `documents`, `is_pre_incorporation`, `paid_by_user_id`, `vat_rate`, `invoice_ref`, etc. (`src/lib/manualCosts.ts`).

---

## 4. Historique fonctionnel notable (commits récents)

Exemples issus de l’historique git sur `SettingsCouts` / coûts :

- KPI coûts fiables (`get-cost-kpi`)
- Réconciliation OpenAI TTS `gpt-4o-mini-tts` (accès rôle 1)
- Billing GCP, sync OVH / plans SaaS
- État des actes avant immatriculation + filtres (sans corbeille)
- Guides audio / TTS reliés au suivi des coûts
- Bloc Configuration Settings (Accès, IA, Coûts, Suivis)

---

## 5. Dernier lot de modifications (working tree / session récente)

Fichiers touchés (diff typique **+182 / −56**) :

### 5.1 `src/lib/manualCosts.ts`

- `partitionAiUsageEventIds()` : sépare les UUID réels `ai_usage_events` des ids synthétiques `usage_log:…`
- Opérations bulk (pré-immat. / catégorie) : retour `{ updated, skipped, error }` avec cas d’erreur `synthetic_usage_logs`

### 5.2 `src/pages/SettingsCouts.tsx`

- **4 nouvelles catégories** manuelles : `beta_tests`, `marketing`, `commercial`, `sous_traitance`
- Tableau : colonne **Actions** sticky ; retrait colonnes modèle + source ; alignement à droite coûts / tokens
- Sélection bulk : exclusion des lignes `usage_log:` ; toasts partiel / synthetic-only
- Ajustements de largeurs de colonnes

### 5.3 `src/lib/preIncorporationReport.ts`

- Labels FR pour les 4 nouvelles catégories dans le rapport « État des actes »

### 5.4 i18n `settings.json` (fr / en)

- Clés bulk (sélection, messages d’erreur / succès partiels)
- Labels `tooltype_*` pour les nouvelles catégories
- `col_actions`

---

## 6. Structure UI (référence pour pages sœurs)

```
[Barre KPI sticky — 4 cartes]
[En-tête : retour Paramètres + titre + sous-titre]
[Alertes optionnelles]
[Barre de filtres]
[Card Tableau + actions export / CRUD / bulk]
[Grid 2 cols : chart timeline | chart répartition]
[Cards secondaires (TTS, Google Billing…)]
[Section inventaire / config fournisseurs]
[Dialogs en bas de page]
```

Ce pattern sert de modèle à la nouvelle page **Chiffre d’affaires** (`/settings/chiffre-affaires`).

---

## 7. Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/pages/SettingsCouts.tsx` | UI complète |
| `src/lib/costs.ts` | Lecture / agrégation / CSV |
| `src/lib/manualCosts.ts` | CRUD manuels + documents |
| `src/lib/preIncorporationReport.ts` | État des actes |
| `src/lib/costLabels.ts`, `costIntegrity.ts`, `costKpiApi.ts` | Labels, contrôles, KPI |
| `src/components/GoogleBillingCard.tsx` | Billing GCP |
| `src/i18n/locales/*/settings.json` → `couts.*` | Textes UI |
| Migrations `20260625120000_manual_costs_documents.sql`, `…cost_documents…` | RLS + bucket |

---

## 8. Hors périmètre

La page Coûts suit les **dépenses** (IA, outils, factures fournisseurs, avances associés).  
Elle ne gère **pas** le chiffre d’affaires clients — traité dans la page Settings dédiée `/settings/chiffre-affaires`.

---

*Fin du rapport page Coûts.*
