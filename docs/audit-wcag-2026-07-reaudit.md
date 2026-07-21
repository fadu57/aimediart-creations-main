# Audit WCAG 2.2 — revue n°2 → n°3 (21 juillet 2026)

| | |
|---|---|
| **Référentiel** | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) niveaux A et AA |
| **Méthode** | Revue statique du code (`src/`) après lots 1–6 + i18n + R1–R6 |
| **Document maître** | [`audit-wcag.md`](audit-wcag.md) — **Revue n°3 finale** |
| **Limite** | Pas de campagne axe CI / NVDA exhaustif dans cette revue |

---

## Verdict

| Niveau | Statut | Commentaire |
|--------|--------|-------------|
| **A (parcours critique)** | **PASS** (Gate A manuel 21/07) | Skip link, focus auth, dialogs Radix QR, tableaux clavier, Sheet vitrine |
| **AA (socle)** | **PASS** (revue code Gate AA) | Contraste tokens, reduced-motion, alts, Close i18n, i18n identité |
| **Déclaration formelle AA 100 %** | Non | Reste optionnel : R5 contraste page-par-page, AT exhaustif |

**En une phrase :** R1–R6 clos (R5 hors scope volontaire) ; le socle A/AA est documenté en **Revue n°3** dans `audit-wcag.md`.

---

## Ce qui est OK (preuves code)

| Critère | Preuve |
|---------|--------|
| 2.4.1 Bypass | `SkipToContentLink` → `#main-content` |
| 2.4.7 Focus visible | Auth + Settings switches + anneaux listes |
| 2.1.1 / 2.1.2 Clavier | Dialogs / Sheet Radix (trap) ; `a11yActivateProps` sur tableaux `*2` |
| 1.4.3 Contraste (socle) | `--muted-foreground` renforcé ; overlays TTS / VisitorView |
| 2.3.3 Motion | `@media (prefers-reduced-motion: reduce)` dans `index.css` |
| 1.1.1 Images | Logos métier ; vitrine i18n ; décoratifs `alt=""` ; `AgencyScopeLogo` fallback |
| 4.1.2 Noms | ToastClose, sponsors, Close Dialog/Sheet i18n |
| i18n métier | `agencies.identity.*`, `dashboard.commercial_*` (fr/en/de/es/it) |

---

## Écarts R1–R6

| ID | Statut | Détail |
|----|--------|--------|
| **R1** | **Clos** | Expos format, Statistics export, PublicVitrineShell → Dialog/Sheet ; AddArtist déjà Radix |
| **R2** | **Clos** | `agencyIdentity.ts` / `commercialTerms.ts` → i18n (plus de libellés FR en dur dans les options) |
| **R3** | **Clos** | Sync `de`/`es`/`it` via `scripts/sync_i18n_de_es_it.py` (0 clé manquante vs FR) |
| **R4** | **Clos** | Revue vitrine / stats / PDF HTML : alts conformes ; polish logo org |
| **R5** | Hors scope | Contraste page-par-page non instrumenté (socle tokens OK) |
| **R6** | **Clos** | AddArtist Dialog Radix (fiche + doublon) |

---

## i18n (lié accessibilité / langue)

| Zone | Correction |
|------|------------|
| Users / Agencies / Expos / Artists | Clés modales + sync de/es/it |
| Identité juridique | `identity.categories|types|roles|validation|convention` |
| Commercial | `commercial_kind.*` + `commercial_plan.*` (dashboard) |
| Logos sticky | `logo_alt_named` / `logo_alt_fallback` |

---

## Recommandations suivantes (optionnel)

1. Smoke axe DevTools sur `/login`, `/artwork`, `/catalogue`, `/agencies`.  
2. NVDA sur parcours QR (5 min).  
3. R5 : audit contraste page-par-page si exigence marché.

---

## Synthèse gates

| Gate | Date | Méthode | Résultat |
|------|------|---------|----------|
| Gate A | 21/07/2026 | Manuel clavier (5 points) | **PASS** |
| Gate AA | 21/07/2026 | Revue code | **PASS** (socle) |
| Revue n°2 | 21/07/2026 | Code + i18n modales | Document présent |
| Revue n°3 | 21/07/2026 | R1–R6 + `audit-wcag.md` final | **Finale** |

*Document versionné — Revue n°3 finale le 21/07/2026.*
