# -*- coding: utf-8 -*-
"""Génère les rapports markdown (docs/ est cursorignored — écriture via ce script)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "rapports"
OUT.mkdir(parents=True, exist_ok=True)

JURIDIQUE = r"""# Rapport — Documents juridiques & pages légales éditables

**Date :** 28 juillet 2026  
**Projet :** AIMEDIArt / ALTIVART  
**Objet :** Synthèse de toutes les modifications autour des documents légaux publics, de l’espace Juridique (création d’entreprise) et de l’infrastructure Supabase associée.

---

## 1. Vue d’ensemble

Le périmètre couvre trois briques complémentaires :

1. **Pages légales publiques** (`/cgv`, `/cookies`, `/privacy`, `/terms`, `/ai-policy`) — consultables par tous, éditables par admin général et juriste.
2. **Espace « Juridique »** (`/juridique` + 7 documents de création d’entreprise) — réservé aux rôles **1** et **8**.
3. **Infrastructure** — tables Supabase, RLS, edge functions (brouillon / publication / e-mails), archivage GED, HTML issu des PDF.

Moteur commun d’édition : `LegalEditablePage` (brouillon, commentaires sur sélection, impression, publication définitive).

---

## 2. Mode d’accès réservé

### 2.1 Rôles concernés

| `role_id` | Nom | Stockage | Droits documents légaux |
|---|---|---|---|
| **1** | `admin_general` | `auth.users.raw_app_meta_data.role_id` (JWT `app_metadata`) | Édition + brouillon + commentaires + **publication définitive** + accès `/juridique` |
| **8** | `juriste` | Idem (`app_metadata.role_id = 8`) | Édition + brouillon + commentaires + accès `/juridique` — **pas** de publication définitive |
| Autres | — | — | Lecture seule des pages **publiées** (pages publiques) ; **pas** d’accès à `/juridique` |

Catalogue SQL : ligne dans `public.roles_user` (`role_id = 8`, `role_name = 'juriste'`).

### 2.2 Fonctions applicatives (`src/lib/authUser.ts`)

| Fonction | Qui passe |
|---|---|
| `canEditLegalPages(role_id, role_name?)` | `role_id ∈ {1, 8}` ou `role_name === "juriste"` |
| `canPublishLegalPages(role_id)` | **Uniquement** `role_id === 1` (via `global_role_id` JWT) |
| `canAccessJuridiqueWorkspace(...)` | Alias de `canEditLegalPages` (1 ou 8) |

La publication côté UI utilise `canPublishLegalPages(global_role_id)` — pas le rôle agence fusionné.

### 2.3 Pages publiques vs espace Juridique

| Zone | URL | Visiteur anonyme | Connecté hors 1/8 | Juriste (8) | Admin (1) |
|---|---|---|---|---|---|
| CGV, cookies, privacy, terms, AI policy | `/cgv`, `/cookies`, … | Contenu **published** | Idem | Édition + draft | Édition + draft + **publish** |
| Hub juridique | `/juridique` | Redirect `/organisation` | Redirect | OK | OK |
| Docs création entreprise | `/juridique/:slug` | Redirect | Redirect | OK | OK |

### 2.4 Navigation UI

- Bouton header vitrine **« Vers le juridique »** (`nav_to_juridique`) : visible si session + `canAccessJuridiqueWorkspace`.
- Emplacement : sous « Vers le studio », hors cadre beige des ancres.
- Dropdown : « Tous les documents » → `/juridique` + 7 liens courts.
- Juriste (8) : navigation SaaS complète comme l’admin 1 (`defaultNavAccessForRole`), écriture métier restreinte ailleurs selon les garde-fous existants.

### 2.5 Contrôles Edge Functions

| Function | Autorisation |
|---|---|
| `notify-legal-draft-saved` | JWT `app_metadata.role_id ∈ {1, 8}` |
| `publish-legal-page-final` | JWT `app_metadata.role_id === 1` uniquement |

---

## 3. Tables & objets Supabase créés / étendus

### 3.1 Migrations concernées

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260728143000_juriste_role_and_legal_pages.sql` | Rôle juriste + table `legal_page_contents` (base) + `is_legal_page_editor()` |
| `supabase/migrations/20260728150000_legal_page_drafts_and_comments.sql` | Statut draft/published + `legal_page_comments` |
| `supabase/migrations/20260728151000_legal_pages_full_bootstrap.sql` | Bootstrap idempotent (équivalent cible) |
| `supabase/migrations/20260722170000_aimediart_docs_category_legal.sql` | Catégorie GED `legal` (préalable archivage) |

### 3.2 `public.roles_user`

Ajout (si absent) :

- `role_id` = **8**
- `label` / `role_name` / `role_name_clair` : Juriste / `juriste`

### 3.3 `public.legal_page_contents`

Contenu HTML des pages légales (une ligne par combinaison slug × locale × statut).

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `slug` | text | `^[a-z0-9_]+$` |
| `locale` | text | défaut `'fr'` |
| `body_html` | text | HTML éditable |
| `status` | text | `'draft'` \| `'published'` |
| `updated_at` | timestamptz | |
| `updated_by` | uuid NULL → `auth.users` | |

- **UNIQUE** `(slug, locale, status)`
- Index sur `slug`

**RLS :**

- **SELECT** : `status = 'published'` **OU** `is_legal_page_editor()`
- **INSERT / UPDATE / DELETE** : `is_legal_page_editor()` uniquement

**Helper** `public.is_legal_page_editor()` : JWT `app_metadata.role_id IN (1, 8)`.

**Slugs utilisés :**

Pages publiques : `cgv`, `cookies`, `privacy`, `terms`, `ai_policy`

Création entreprise :

`contrat_mise_disposition_locaux`, `pacte_associes`, `declaration_non_condamnation`, `etat_actes_formation`, `liste_souscripteurs`, `convention_associes_remuneration`, `statuts_sas`

### 3.4 `public.legal_page_comments`

Commentaires liés aux marques jaunes dans le HTML.

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `content_id` | uuid → `legal_page_contents.id` | ON DELETE CASCADE |
| `mark_id` | text | id de la marque HTML |
| `quote_text` | text | extrait sélectionné |
| `body` | text | texte du commentaire |
| `created_at` | timestamptz | |
| `created_by` | uuid NULL → `auth.users` | |

- **UNIQUE** `(content_id, mark_id)`
- **RLS** : CRUD réservé aux éditeurs légaux (`is_legal_page_editor()`)

### 3.5 GED (réutilisation)

- Catégorie / dossiers `legal` dans `aimediart_document_folders` / `aimediart_documents`
- Dossier cible à la publication : **« Divers juridique (à faire valider) »**
- Préfixe fichier : `Version validée — {titre}.pdf`

---

## 4. Fonctionnalités livrées

### 4.1 Édition collaborative (admin 1 + juriste 8)

- Mode édition `contentEditable`
- Sauvegarde **brouillon** (`status = draft`)
- Commentaires sur sélection (marks jaunes `legal-annotation`)
- Bannière brouillon / toolbar flottante
- Impression navigateur (`printLegalHtml`) — CSS Arial pour docs PDF

### 4.2 Publication définitive (admin 1 seul)

1. Strip des annotations
2. Upsert `published` (+ draft aligné)
3. Traduction HTML FR → **en / de / es / it** (Groq via edge `publish-legal-page-final`)
4. E-mail de confirmation (Resend)
5. Archivage PDF en GED

À la sauvegarde brouillon : edge `notify-legal-draft-saved` (notification e-mail).

### 4.3 Fallback sans contenu en base

Si aucune ligne DB : rendu i18n (`cgv.json`, `cookies.json`, …) ou HTML embarqué création entreprise (`src/content/creationEntreprise/docs.fr.ts`).

### 4.4 Espace Juridique — 7 documents PDF

Sources GED « création entreprise », converties en HTML fidèle (Arial, gras, titres, listes, tableaux) via :

`scripts/rebuild-creation-entreprise-html-from-pdf.py`  
→ `src/content/creationEntreprise/fr/*.html` + `docs.fr.ts`  
→ styles `pdfLegalDocStyles.ts` (classe `.pdf-legal-doc`)

| Titre | Path URL | Slug DB |
|---|---|---|
| Contrat de mise à disposition de locaux | `/juridique/contrat-mise-disposition-locaux` | `contrat_mise_disposition_locaux` |
| Pacte d'associés | `/juridique/pacte-associes` | `pacte_associes` |
| Déclaration de non-condamnation et de filiation | `/juridique/declaration-non-condamnation` | `declaration_non_condamnation` |
| État des actes (formation) | `/juridique/etat-actes-formation` | `etat_actes_formation` |
| Liste des souscripteurs | `/juridique/liste-souscripteurs` | `liste_souscripteurs` |
| Convention rémunération dirigeants | `/juridique/convention-associes-remuneration` | `convention_associes_remuneration` |
| Statuts SAS | `/juridique/statuts-sas` | `statuts_sas` |

---

## 5. Fichiers applicatifs principaux

| Fichier | Rôle |
|---|---|
| `src/pages/LegalEditablePage.tsx` | Moteur d’édition partagé |
| `src/pages/CgvPage.tsx`, `CookiesPage`, `PrivacyPage`, `TermsPage`, `AiPolicyPage` | Wrappers publics |
| `src/pages/JuridiqueHubPage.tsx` | Hub `/juridique` |
| `src/pages/JuridiqueDocPage.tsx` | Doc unique + garde d’accès |
| `src/pages/pdfLegalDocStyles.ts` | CSS forme PDF |
| `src/lib/legalDocuments.ts` | CRUD, marks, print, invoke edges |
| `src/lib/legalGedArchive.ts` | PDF + upload GED |
| `src/lib/creationEntrepriseDocs.ts` | Catalogue / slugs / paths |
| `src/content/creationEntreprise/docs.fr.ts` | HTML FR des 7 docs |
| `src/lib/authUser.ts`, `useAuthUser.ts`, `roleHierarchy.ts` | Rôles 1 & 8 |
| `src/components/Header.tsx` | Menu « Vers le juridique » |
| `src/i18n/locales/*/legal_editor.json`, `juridique.json` | UI éditeur + hub |
| Edge `notify-legal-draft-saved`, `publish-legal-page-final` | Mails + publish i18n |

---

## 6. Déploiements à prévoir côté Supabase

1. Appliquer les migrations `20260728143*`, `150*`, `151*`
2. Déployer les edge functions `notify-legal-draft-saved` et `publish-legal-page-final`
3. Affecter `app_metadata.role_id = 8` aux comptes juristes (Auth → Users → app_metadata)
4. Vérifier secrets Resend / Groq pour les edges

---

## 7. Points d’attention

- Un contenu déjà **sauvegardé en DB** (draft/published) **prime** sur le HTML/i18n de fallback. Pour réafficher le HTML régénéré depuis PDF : vider/réécrire la ligne DB ou coller le nouveau HTML en édition.
- Les documents création entreprise contiennent des **données personnelles** ; les PDF locaux sous `scripts/_creation_entreprise_pdfs/` ne doivent pas être commités.
- Publication = seule voie pour pousser les traductions automatiques vers les 5 langues.

---

*Fin du rapport documents juridiques.*
"""

COUTS = r"""# Rapport — Modifications page Coûts (`/settings/couts`)

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
"""

(OUT / "rapport-documents-juridiques.md").write_text(JURIDIQUE, encoding="utf-8")
(OUT / "rapport-page-couts.md").write_text(COUTS, encoding="utf-8")
print("OK", OUT / "rapport-documents-juridiques.md")
print("OK", OUT / "rapport-page-couts.md")
