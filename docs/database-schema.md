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

**Scripts SQL (ordre d’exécution) :**
1. `supabase/sql/visitors_anonymous_fingerprint_and_pseudo.sql` — empreintes + RPC de base
2. `supabase/sql/visitors_pseudo_pool_rpc.sql` — génération pseudo depuis `pseudo_pool`
3. `supabase/sql/visitors_avatar_url_and_confirm_rpc.sql` — avatar URL + extension RPC pseudo
4. `supabase/sql/visitors_get_profile_rpc.sql` — reconnaissance visiteur de retour
5. `supabase/sql/visitors_recovery_code_rpc.sql` — code de liaison explicite (cross-navigateur) + `auth_user_id`

**Colonnes principales (parcours scan / visite rapide) :**

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | uuid | PK |
| `visitor_name` | text | ex. `Anonymous` à la création |
| `visitor_pseudo` | text | Pseudo affiché (pool avatars + 3 chiffres, ex. `CanardTendre747`) |
| `avatar_url` | text | URL publique Supabase Storage (bucket `avatars`) |
| `avatar_object_path` | text | Chemin objet Storage relatif (ex. `adorable_duck.png`) |
| `visitor_client_id` | text | UUID navigateur persistant (hors auth Supabase), UNIQUE |
| `fingerprint` | text | visitorId FingerprintJS (si consentement traceur anonyme) |
| `fingerprint_source` | text | ex. `fingerprintjs_visitor_id` |
| `user_agent` | text | User-Agent transmis volontairement post-consentement |
| `client_locale` | text | Locale navigateur |
| `client_timezone` | text | Fuseau horaire IANA |
| `screen_resolution` | text | ex. `1920x1080` |
| `ip_address` | text | Dernière IP connue (Edge Function `get-client-ip`) |
| `browser_name` | text | ex. Chrome, Safari |
| `device_type` | text | `desktop`, `mobile`, `tablet` |
| `country` | text | Géolocalisation optionnelle |
| `city` | text | Géolocalisation optionnelle |
| `last_seen_at` | timestamptz | Dernière activité |
| `recovery_code_hash` | text | SHA-256 du code de liaison 8 caractères (cross-navigateur) |
| `recovery_code_created_at` | timestamptz | Création / régénération du code |
| `auth_user_id` | uuid | Compte `auth.users` lié à l’inscription visiteur |

**Fonctions publiques (EXECUTE pour `anon` / `authenticated`) :**
- `register_anonymous_visitor(...)` — crée ou met à jour la ligne (fingerprints + traces device)
- `get_anonymous_visitor_profile(p_visitor_client_id?, p_fingerprint?)` — reconnaît un visiteur de retour (pseudo + avatar)
- `generate_visitor_pseudo(locale)` — pseudo aléatoire depuis `pseudo_pool`
- `confirm_visitor_pseudo_from_client(p_visitor_client_id, p_pseudo, p_avatar_url?, p_avatar_object_path?)` — persiste pseudo + avatar (visite rapide « Continuer la visite »)
- `generate_visitor_recovery_code(p_visitor_client_id, p_regenerate?)` — code de liaison 8 caractères (affiché une fois)
- `link_visitor_profile_by_recovery_code(p_recovery_code, p_visitor_client_id)` — rattache le profil sur un autre navigateur
- `link_visitor_to_auth_user(p_visitor_client_id, p_auth_user_id)` — liaison compte à l’inscription

**Flux app « Visite rapide » (`VisitorWelcome`) :**
1. Clic « Visite rapide » → `get_anonymous_visitor_profile` (UUID navigateur + fingerprint) ou cache local
2. Si profil connu → écran « bienvenue de retour » avec avatar + pseudo i18n
3. Sinon → choix avatar → `register_anonymous_visitor` + `confirm_visitor_pseudo_from_client` + **code de liaison** (noter pour autre navigateur)
4. Autre navigateur → « Retrouver mon profil » ou URL `?recover=XXXXXXXX` → `link_visitor_profile_by_recovery_code`

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
