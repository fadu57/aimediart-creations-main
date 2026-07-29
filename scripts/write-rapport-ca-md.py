# -*- coding: utf-8 -*-
"""Génère le rapport markdown sur la page Chiffre d'affaires."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "rapports"
OUT.mkdir(parents=True, exist_ok=True)

CONTENT = r"""# Rapport — Création de la page Chiffre d'affaires

**Date :** 28 juillet 2026  
**Projet :** AIMEDIArt  
**Objet :** Documentation de la création de la sous-page Settings dédiée au suivi du chiffre d'affaires (`/settings/chiffre-affaires`), miroir fonctionnel de la page Coûts.

**Rapports connexes :**
- `docs/rapports/rapport-page-couts.md` — page Coûts (modèle UX)
- `docs/rapports/rapport-documents-juridiques.md` — documents juridiques

---

## 1. Contexte & objectif

Avant cette livraison, la plateforme disposait d’un suivi détaillé des **dépenses** (`/settings/couts` : IA, outils, factures fournisseurs, avances associés) mais **aucun module de compilation du chiffre d’affaires** (recettes clients).

Objectif : créer une page Settings qui **compile les CA réalisés**, avec :

- saisie manuelle des écritures (factures / encaissements),
- KPI, filtres, tableau, export CSV, graphiques,
- même logique d’accès que les coûts manuels (admins globaux 1–2),
- navigation dans le sous-menu **Suivis**, juste sous « Coûts ».

---

## 2. Localisation & navigation

| Élément | Détail |
|---|---|
| **Route** | `/settings/chiffre-affaires` |
| **Composant** | `src/pages/SettingsChiffreAffaires.tsx` |
| **Lazy load** | `src/routes/lazyPages.tsx` → `SettingsChiffreAffaires` |
| **Déclaration route** | `src/App.tsx` |
| **Menu** | Settings → **Suivis** → « Chiffre d'affaires » (`SettingsMenuDropdown` / `SUIVI_LINKS`) |
| **Icône** | `TrendingUp` (lucide-react) |
| **Matrice d’accès** | Clé `page_settings_ca`, label « Chiffre d'affaires », path `["/settings/chiffre-affaires"]` |
| **Retour** | Lien « Paramètres » → `/settings` |

Ordre dans le sous-menu Suivis :

1. Coûts  
2. **Chiffre d'affaires** *(nouveau)*  
3. Tokens  
4. Temps  
5. Supabase  

---

## 3. Mode d’accès

| Action | Qui |
|---|---|
| Voir le menu / ouvrir la page | Selon matrice (`page_settings_ca`) + rôles habituels Settings |
| **Lire / écrire / supprimer** les écritures | Admins globaux `role_id` **1** ou **2** (`admin_general` / `super_admin`) |
| Upload / lecture pièces jointes | Idem (bucket Storage protégé) |

Côté base : réutilisation de `public.is_cost_admin()` (JWT `app_metadata.role_id IN (1, 2)`), déjà utilisée pour les coûts manuels.

Côté UI : `canEdit = global_role_id ∈ {1, 2}` via `useAuthUser()`.

Les autres rôles authentifiés ne passent pas les policies RLS (pas de SELECT sur `revenue_entries`).

---

## 4. Supabase — objets créés

### 4.1 Migration

Fichier : `supabase/migrations/20260728180000_revenue_entries.sql`

### 4.2 Table `public.revenue_entries`

| Colonne | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `entry_date` | date NOT NULL | Date de l’écriture |
| `label` | text NOT NULL | Libellé (ex. « Abonnement Pro — Musée X ») |
| `category` | text NOT NULL | Défaut `'abonnement'` |
| `client_name` | text NULL | Nom client / organisation |
| `agency_id` | uuid NULL → `agencies.id` | Lien optionnel organisation |
| `amount_ttc` | numeric(14,2) NOT NULL | ≥ 0 |
| `currency` | text NOT NULL | Défaut `'EUR'` |
| `vat_rate` | numeric(5,2) NOT NULL | Défaut `20` |
| `invoice_ref` | text NULL | N° facture / référence |
| `status` | text NOT NULL | `'draft'` \| `'invoiced'` \| `'paid'` \| `'cancelled'` |
| `note` | text NULL | |
| `documents` | jsonb NOT NULL | Liste `{ path, name }[]`, défaut `[]` |
| `created_at` / `updated_at` | timestamptz | |
| `created_by` / `updated_by` | uuid NULL → `auth.users` | |

**Index :** `entry_date` (desc), `status`, `category`.

**RLS :** SELECT / INSERT / UPDATE / DELETE → `authenticated` **ET** `is_cost_admin()`.

### 4.3 Bucket Storage `revenue-documents`

- Privé, limite ~20 Mo
- MIME : PDF, JPEG, PNG, WebP, DOC, DOCX
- Policies Storage : CRUD réservé à `is_cost_admin()`
- URLs signées côté app (TTL 1 h)

---

## 5. Fonctionnalités de la page

Structure calquée sur Coûts (page scrollable, **sans onglets**) :

```
[4 cartes KPI]
[En-tête : retour + titre + sous-titre]
[Filtres : dates, catégorie, statut, recherche]
[Card tableau + Export CSV + Ajouter]
[Grid 2 cols : barres mensuelles | camembert catégories]
[Dialog création / édition]
```

### 5.1 KPI

| Indicateur | Calcul |
|---|---|
| CA total | Somme TTC des lignes hors `cancelled` |
| Encaissé | Somme des lignes `status = paid` |
| Nombre de lignes | Compte des lignes actives + panier moyen |
| Top catégorie | Catégorie au plus fort montant |

### 5.2 Filtres

- Intervalle de dates (`entry_date`)
- Catégorie
- Statut
- Recherche texte (libellé, client, n° facture)

### 5.3 Tableau & CRUD

- Colonnes : date, libellé (+ ref facture), client, catégorie, statut, montant TTC, actions
- Ajout / édition (dialog) / suppression (confirm)
- Pièces jointes : upload multi-fichiers, ouverture via URL signée
- Export CSV (séparateur `;`)

### 5.4 Graphiques (Recharts)

- **BarChart** : CA par mois (`YYYY-MM`)
- **PieChart** : répartition par catégorie

### 5.5 Catégories métier

| Clé | Libellé FR |
|---|---|
| `abonnement` | Abonnement |
| `pack_oeuvres` | Pack œuvres |
| `prestation` | Prestation |
| `licence` | Licence |
| `formation` | Formation |
| `autre` | Autre |

### 5.6 Statuts

| Clé | Libellé FR |
|---|---|
| `draft` | Brouillon |
| `invoiced` | Facturé |
| `paid` | Payé |
| `cancelled` | Annulé |

---

## 6. Couche applicative

| Fichier | Rôle |
|---|---|
| `src/lib/revenueEntries.ts` | Types, CRUD Supabase, KPI, CSV, upload / signed URL |
| `src/pages/SettingsChiffreAffaires.tsx` | UI complète |
| `src/routes/lazyPages.tsx` | Export lazy |
| `src/App.tsx` | Route |
| `src/components/SettingsMenuDropdown.tsx` | Entrée menu Suivis |
| `src/lib/navigationMatrix.ts` | `page_settings_ca` |
| `src/i18n/locales/fr/settings.json` → `ca.*` | Textes FR page |
| `src/i18n/locales/en/settings.json` → `ca.*` | Textes EN page |
| `src/i18n/locales/*/header.json` → `settings_submenu_ca` | Label menu (fr/en/de/es/it) |
| `src/i18n/locales/fr|en/settings.json` → `nav_entry_page_ca` | Label matrice Accès |

API principale (`revenueEntries.ts`) :

- `listRevenueEntries(filters)`
- `createRevenueEntry` / `updateRevenueEntry` / `deleteRevenueEntry`
- `computeRevenueKpis`
- `uploadRevenueDocument` / `getRevenueDocumentSignedUrl`
- `exportRevenueCsv`

---

## 7. Choix de conception

| Choix | Justification |
|---|---|
| Table dédiée `revenue_entries` (pas `ai_usage_events`) | Séparer clairement recettes et dépenses ; modèle métier distinct (client, statut facture) |
| Même `is_cost_admin()` que les coûts | Cohérence : suivi financier réservé aux admins 1–2 |
| Saisie manuelle v1 | Pas encore de sync Stripe / abonnements SaaS → compilation contrôlée |
| UX miroir Coûts | Homogénéité Settings / Suivis, courbe d’apprentissage nulle |
| `agency_id` nullable dès le schéma | Prépare un rattachement organisation sans bloquer la v1 |

---

## 8. Déploiement

1. Appliquer la migration `20260728180000_revenue_entries.sql` sur le projet Supabase.
2. Vérifier que le bucket `revenue-documents` apparaît dans Storage.
3. Tester avec un compte `app_metadata.role_id` = 1 ou 2 :
   - menu Suivis → Chiffre d’affaires,
   - création d’une écriture + pièce jointe,
   - filtres / CSV / graphiques.
4. (Optionnel) Ajuster la case `page_settings_ca` dans Paramètres → Accès si besoin de restreindre la visibilité du menu.

Sans migration appliquée, la page charge mais les appels Supabase échouent (table / bucket absents).

---

## 9. Hors périmètre (évolutions possibles)

- Import automatique depuis Stripe / facturation SaaS organisation
- Lien systématique `agency_id` dans le formulaire (liste déroulante organisations)
- Comparaison CA vs Coûts (marge) sur un même tableau de bord
- Multi-devises consolidées (taux de change comme sur Coûts)
- i18n complète `ca.*` pour de / es / it (aujourd’hui fr + en ; menu header déjà traduit)

---

## 10. Synthèse

| Livrable | Statut |
|---|---|
| Page UI `/settings/chiffre-affaires` | Créée |
| Menu Suivis + matrice + i18n | Créés |
| Table `revenue_entries` + RLS | Migration prête |
| Bucket `revenue-documents` | Migration prête |
| CRUD + KPI + charts + CSV | Opérationnels (après migrate) |

---

*Fin du rapport création page Chiffre d’affaires.*
"""

path = OUT / "rapport-page-chiffre-affaires.md"
path.write_text(CONTENT, encoding="utf-8")
print("OK", path)
print("bytes", path.stat().st_size)
