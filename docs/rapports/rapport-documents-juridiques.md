# Rapport — Documents juridiques & pages légales éditables

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
