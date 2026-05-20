# Schéma de base de données AIMEDIArt
> Audit généré le 16 mai 2026 — Supabase / PostgreSQL

---

## Résumé global

| Tables publiques | Fonctions | Triggers | Index | Policies RLS | Tables sans RLS |
|-----------------|-----------|----------|-------|--------------|-----------------|
| 29              | 23        | 3        | 62    | 68           | 2               |

---

## Schémas

| Schéma  | Nb tables | Usage                              |
|---------|-----------|------------------------------------|
| public  | 29        | Données métier AIMEDIArt           |
| auth    | 22        | Authentification (géré Supabase)   |
| storage | 8         | Fichiers/images (géré Supabase)    |

---

## Tables publiques — détail

### agencies — Agences / galeries clientes
| Colonne              | Type        | Nullable | Défaut            |
|----------------------|-------------|----------|-------------------|
| id                   | uuid        | NO       | gen_random_uuid() |
| name_agency          | text        | NO       | —                 |
| logo_agency          | text        | YES      | —                 |
| logo2_agency         | text        | YES      | —                 |
| adresse_agency       | text        | YES      | —                 |
| compl_adresse_agency | text        | YES      | —                 |
| zip_agency           | text        | YES      | —                 |
| city_agency          | text        | YES      | —                 |
| cedex_agency         | text        | YES      | —                 |
| phone_agency         | text        | YES      | —                 |
| mail_agency          | text        | YES      | —                 |
| web_agency           | text        | YES      | —                 |
| acronyme_expo        | text        | YES      | —                 |
| deleted_at           | timestamptz | YES      | —                 |
| created_at           | timestamptz | YES      | now()             |

**RLS :** ✅ activé
| Policy | Commande | Condition |
|--------|----------|-----------|
| agencies_select | SELECT | rls_is_global_admin() OR rls_is_agency_staff_for(id) |
| agencies_insert | INSERT | authenticated |
| agencies_update | UPDATE | rls_is_global_admin() OR rls_is_agency_staff_for(id) |
| agencies_delete | DELETE | rls_is_global_admin() |

---

### agency_users — Liaison utilisateurs ↔ agences
| Colonne    | Type        | Nullable |
|------------|-------------|----------|
| user_id    | uuid        | NO       |
| agency_id  | uuid        | NO       |
| role_id    | integer     | NO       |
| created_at | timestamptz | NO       |

**FK :** agency_id → agencies (CASCADE), role_id → roles_user
**RLS :** ✅ activé
| Policy | Commande | Condition |
|--------|----------|-----------|
| agency_users_select | SELECT | user_id = auth.uid() OR rls_is_global_admin() OR rls_is_agency_staff_for(agency_id) |
| agency_users_insert | INSERT | authenticated |
| agency_users_update | UPDATE | rls_is_global_admin() |
| agency_users_delete | DELETE | rls_is_global_admin() |

---

### artists — Artistes
| Colonne                | Type        | Nullable |
|------------------------|-------------|----------|
| artist_id              | uuid        | NO       |
| artist_lastname        | text        | YES      |
| artist_firstname       | text        | YES      |
| artist_nickname        | text        | YES      |
| artist_bio             | text        | YES      |
| artist_email           | text        | YES      |
| artist_phone           | text        | YES      |
| artist_photo_url       | text        | YES      |
| artist_birth_date      | date        | YES      |
| artist_typ             | text        | YES      |
| artist_pays            | text        | YES      |
| artist_zipcode         | text        | YES      |
| artist_ville           | text        | YES      |
| artist_adresse         | text        | YES      |
| artist_adresse2        | text        | YES      |
| artist_address         | text        | YES      |
| artist_city            | text        | YES      |
| artist_initiale_artist | text        | YES      |
| artist_control         | text        | YES      |
| artist_created_at      | timestamptz | YES      |
| deleted_at             | timestamptz | YES      |

**RLS :** ✅ activé
| Policy | Commande | Rôles | Condition |
|--------|----------|-------|-----------|
| artists readable by everyone | SELECT | anon, authenticated | deleted_at IS NULL |
| artists_select_staff | SELECT | authenticated | rls_is_staff() |
| artists_insert_staff | INSERT | authenticated | — |
| artists_update_staff | UPDATE | authenticated | rls_is_staff() |
| artists_delete_admin | DELETE | authenticated | rls_is_global_admin() |

---

### artist_bios — Biographies multilingues
| Colonne    | Type        | Nullable |
|------------|-------------|----------|
| id         | uuid        | NO       |
| artist_id  | uuid        | NO       |
| agency_id  | uuid        | YES      |
| language   | text        | NO       |
| bio_text   | text        | NO       |
| created_at | timestamptz | YES      |
| updated_at | timestamptz | YES      |

**FK :** artist_id → artists (CASCADE), agency_id → agencies (SET NULL)
**RLS :** ✅ activé
| Policy | Commande | Condition |
|--------|----------|-----------|
| Anyone can read artist_bios | SELECT | true (public) |
| Authenticated users can insert | INSERT | authenticated |
| Authenticated users can update | UPDATE | auth.role() = 'authenticated' |
| Authenticated users can delete | DELETE | auth.role() = 'authenticated' |

---

### artist_translations — Traductions SEO artistes
| Colonne         | Type        | Nullable |
|-----------------|-------------|----------|
| id              | uuid        | NO       |
| artist_id       | uuid        | NO       |
| locale          | text        | NO       |
| name            | text        | YES      |
| biography       | text        | YES      |
| seo_title       | text        | YES      |
| seo_description | text        | YES      |
| created_at      | timestamptz | NO       |
| updated_at      | timestamptz | NO       |

**FK :** artist_id → artists (CASCADE), locale → locales
**RLS :** ✅ activé — SELECT public (true)

---

### artist_agency_details — Bios spécifiques par agence
| Colonne             | Type        | Nullable |
|---------------------|-------------|----------|
| id                  | uuid        | NO       |
| artist_id           | uuid        | YES      |
| agency_id           | uuid        | YES      |
| agency_specific_bio | text        | YES      |
| updated_at          | timestamptz | YES      |

**FK :** artist_id → artists (CASCADE), agency_id → agencies (CASCADE)
**RLS :** ✅ activé — admin global + staff agence + lecture public agence

---

### artworks — Œuvres
| Colonne                      | Type        | Nullable | Note |
|------------------------------|-------------|----------|------|
| artwork_id                   | uuid        | NO       | PK   |
| artwork_artist_id            | uuid        | YES      | FK → artists (SET NULL) |
| artwork_expo_id              | uuid        | YES      | FK → expos |
| artwork_agency_id            | uuid        | YES      | FK → agencies |
| artwork_title                | text        | YES      | —    |
| artwork_description_i18n     | jsonb       | NO       | Médiation multilingue (styles / langues) |
| artwork_source_material      | text        | YES      | —    |
| artwork_source_material_i18n | jsonb       | NO       | ✅ nouveau multilingue |
| artwork_photo_url            | text        | YES      | —    |
| artwork_image_url            | text        | YES      | —    |
| artwork_qr_code_url          | text        | YES      | —    |
| artwork_qrcode_image         | text        | YES      | —    |
| artwork_room_name            | text        | YES      | —    |
| artwork_status               | text        | YES      | 'draft' |
| artwork_prompt_style_id      | uuid        | YES      | FK → prompt_style |
| artwork_fingerprint          | text        | YES      | —    |
| artwork_moyenne_coeurs       | numeric     | YES      | 0    |
| artwork_total_visites        | integer     | YES      | 0    |
| artwork_created_at           | timestamptz | YES      | —    |
| artwork_deleted_at           | timestamptz | YES      | ⚠️ doublon |
| deleted_at                   | timestamptz | YES      | ⚠️ doublon |

**RLS :** ✅ activé — admin global + staff agence

---

### expos — Expositions
**FK :** agency_id → agencies
**RLS :** ✅ activé — admin global + staff agence

---

### expo_user_role — Rôles utilisateurs par exposition
**FK :** user_id → users_legacy (CASCADE), expo_id → expos (CASCADE)
**RLS :** ✅ activé — own user OR admin OR staff agence expo

---

### profiles — Profils utilisateurs
**FK :** preferred_locale → locales
**RLS :** ✅ activé — own profile OR admin global
⚠️ doublon de policies : `profiles_select_own_or_admin` ET `users can read own profile`
→ à consolider en une seule policy

---

### prompt_style — Styles de prompt IA par agence
**FK :** agency_id → agencies (CASCADE)
**RLS :** ✅ activé
⚠️ 4 policies SELECT redondantes (anon, public, authenticated, by_role)
→ à consolider

---

### emotions — Émotions visiteurs
**RLS :** ✅ activé — SELECT public (true)

---

### visitor_feedback — Feedbacks visiteurs
**FK :** agency_id, emotion_id, expo_id
**RLS :** ✅ activé
| Policy | Commande | Condition |
|--------|----------|-----------|
| vf_insert_public | INSERT | anon + authenticated |
| vf_select_auth | SELECT | authenticated |
| vf_select_public | SELECT | public |

---

### visitors — Visiteurs anonymes
**RLS :** ✅ activé — `visitors_deny_all` → ALL = false
⚠️ Accès complètement bloqué même en SELECT — accès uniquement via fonctions SECURITY DEFINER

---

### visit_logs — Logs de visite
**FK :** visitor_id → visitors, artwork_id → artworks
**RLS :** ✅ activé — `visit_logs_deny_all` → ALL = false
⚠️ Même logique que visitors — accès via SECURITY DEFINER uniquement

---

### daily_stats — Stats quotidiennes
**FK :** agency_id, expo_id → CASCADE
**RLS :** ✅ activé — `daily_stats_deny_all` → ALL = false

---

### app_settings — Paramètres globaux
**RLS :** ✅ activé — SELECT staff, ALL admin

### retention_settings — Rétention des données RGPD
**FK :** updated_by → profiles
**RLS :** ✅ activé — admin uniquement (SELECT/INSERT/UPDATE/DELETE)

### matrice_securite — Matrice rôles/permissions
**RLS :** ✅ activé — SELECT staff, ALL admin

### roles_user — Rôles utilisateurs
**RLS :** ✅ activé — SELECT authenticated (true)

### locales — Langues disponibles
**RLS :** ✅ activé — SELECT public (is_active = true)
⚠️ doublon : 2 policies SELECT identiques (`locales are readable by everyone` + `locales readable by everyone`)

### translations — Traductions génériques
**RLS :** ✅ activé

### social_links — Liens sociaux artistes
**FK :** artist_id → artists (CASCADE), link_type_id → social_link_types
**RLS :** ✅ activé — SELECT public (true)

### social_link_types — Types de liens sociaux
**RLS :** ✅ activé — SELECT public (true)

### countries_phone — Référentiel pays/indicatifs
**RLS :** ✅ activé — SELECT public (true)

### postcode — Codes postaux
**RLS :** ✅ activé — SELECT public (true)

### pseudo_pool — Pool de pseudonymes visiteurs
**RLS :** ✅ activé

---

## ⚠️ Tables SANS RLS — CRITIQUE

| Table | Risque | Action |
|-------|--------|--------|
| **pricing** | Données tarifaires lisibles sans contrôle | Activer RLS + policy admin |
| **users_legacy** | Table utilisateurs — accès non restreint | Activer RLS + policies urgentes |

---

## Relations principales (FK)
agencies ←── agency_users, artist_bios, artist_agency_details,
artworks, expos, daily_stats, prompt_style,
users_legacy, visitor_feedback

artists ←── artist_bios, artist_translations,
artist_agency_details, artworks, social_links

artworks ←── visit_logs
visitors ←── visit_logs
expos ←── expo_user_role, artworks, daily_stats, visitor_feedback
profiles ←── retention_settings

---

## Dette technique identifiée

| # | Table | Problème | Priorité |
|---|-------|----------|----------|
| 1 | artworks | Doublon `deleted_at` / `artwork_deleted_at` | Moyenne |
| 2 | artworks | Cohérence `artwork_source_material` vs `artwork_source_material_i18n` | Moyenne |
| 3 | artists | Colonnes adresse redondantes (artist_adresse / artist_address / artist_city / artist_ville) | Basse |
| 4 | artists | `artist_bio` dans artists vs table `artist_bios` dédiée | Haute |
| 5 | profiles | 2 policies SELECT redondantes | Basse |
| 6 | prompt_style | 4 policies SELECT redondantes | Basse |
| 7 | locales | 2 policies SELECT identiques | Basse |
| 8 | pricing | RLS désactivé — données tarifaires exposées | **Critique** |
| 9 | users_legacy | RLS désactivé — table utilisateurs exposée | **Critique** |
| 10 | users_legacy | Rôle exact vs auth.users + profiles à clar
