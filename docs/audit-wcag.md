# Audit accessibilité WCAG 2.2 — AIMEDIArt

| | |
|---|---|
| **Document** | **Revue n°3 — version finale** (état des lieux + remédiation lots 1–6 + R1–R6) |
| **Référentiel** | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) niveaux A et AA |
| **Périmètre** | Frontend React/TypeScript (`src/`) — code, design UI, contenus |
| **Méthode** | Revue statique + Gate A manuelle + Gate AA revue code |
| **Date** | 21 juillet 2026 |
| **Complément** | Historique détaillé des lots : sections 5–8 ci-dessous ; revue intermédiaire : [`audit-wcag-2026-07-reaudit.md`](audit-wcag-2026-07-reaudit.md) |
| **Limite** | Pas de certification tierce ni campagne AT (NVDA/VoiceOver) exhaustive ; pas de CI axe sur toutes les routes |

---

## Verdict — Revue n°3 (finale)

| Niveau | Statut | Commentaire |
|--------|--------|-------------|
| **A (parcours critique)** | **PASS** | Skip link, focus auth, dialogs Radix, tableaux clavier, menu vitrine Sheet |
| **AA (socle)** | **PASS** | Contraste tokens, reduced-motion, alts métier / vitrine / stats, Close i18n |
| **Déclaration formelle AA 100 %** | Non | Hors scope : certif tierce, contraste page-par-page instrumenté, AT exhaustif |

**En une phrase :** le socle WCAG 2.2 A/AA du produit est en place sur le parcours musée, l’auth et le backoffice listes ; les écarts revue n°2 (R1–R6) sont clos. Ce n’est pas une certification officielle.

---

## Écarts R1–R6 — résolution (21/07/2026)

| ID | Écart | Résolution |
|----|-------|------------|
| **R1** | Dialogs / overlays custom hors Radix | `AddArtistDialog`, panneau format `Expos`, overlay export `Statistics`, menu mobile `PublicVitrineShell` → Dialog / Sheet (trap + Escape) |
| **R2** | Libellés FR hardcodés identité / commercial | `agencyIdentity.ts` + `commercialTerms.ts` → clés i18n `agencies.identity.*` / `dashboard.commercial_*` |
| **R3** | Clés manquantes `de` / `es` / `it` | Sync `scripts/sync_i18n_de_es_it.py` — agencies, expos, artists, utilisateurs, identity (+ dashboard commercial) |
| **R4** | Images vitrine / stats / PDF | Revue : décoratifs `alt=""`, informatifs nommés / i18n ; fallback logo org (`AgencyScopeLogo`) |
| **R5** | Contraste page-par-page | **Accepté hors scope immédiat** (socle tokens OK ; instrumenter plus tard) |
| **R6** | `AddArtistDialog` custom | Dialog Radix (fiche + doublon) |

---

## Correctifs réalisés (juillet 2026) — lots 1–6

Correctifs **additifs / ciblés** (comportement produit et look conservés) :

| Lot | Points clés |
|-----|-------------|
| **1** | Skip link ; focus auth ; IndoorAudio / AudioBan → Radix |
| **2** | Toasts, TTS, profil, cookies, h1 œuvre, diary aria, Escape vitrine |
| **3** | VisitorView + carnet + exit → Radix ; émotions `aria-pressed` |
| **4** | Tableaux clavier (`a11yClickable`) ; sponsors aria-label ; `nav` header |
| **5** | Contraste tokens ; reduced-motion ; overlays TTS / Visitor ; Swiper |
| **6** | Alts logos métier ; Close Dialog/Sheet i18n ; focus Settings |

**Explications visuelles lot 1 :** [`docs/a11y-lot1-visuel.md`](a11y-lot1-visuel.md)

---

## 1. Indicateurs

| Indicateur | Valeur |
|------------|--------|
| Gate A (express manuel) | **PASS** (21/07/2026) |
| Gate AA (revue code) | **PASS** (21/07/2026) |
| Revue n°3 | **Finale** — R1–R6 clos (R5 hors scope volontaire) |
| Cible | **WCAG 2.2 AA** (socle) |

**Ne pas viser AAA** sauf exigence marché public explicite.

---

## 2. Périmètre et priorités par zone

| Zone | Routes (exemples) | Priorité a11y |
|------|-------------------|---------------|
| **Visiteur QR** | `/scan*`, `/visitor`, `/artwork/:id`, `/artwork-group/:id`, `/register*`, `/summary` | **Critique** |
| **Auth public** | `/login`, `/signup`, `/reset-password` | Haute |
| **Vitrine / marketing** | `/organisation`, pages légales | Haute |
| **Backoffice** | `/dashboard`, `/catalogue`, `/artistes`, `/expos`, `/settings*` | Ensuite |

---

## 3. Atouts en place

- **Radix / shadcn** : focus trap et Escape sur Dialog, AlertDialog, Sheet, Select, Switch, Tabs, toasts.
- **Button** : `focus-visible:ring-2` par défaut.
- **Form + RHF** : `aria-invalid` + `aria-describedby` sur le pattern standard.
- **Langue** : `html lang` synchronisé ; libellés identité / commercial i18n (fr/en/de/es/it).
- **Images** : logos métier nommés ; vitrine alts i18n ; décoratifs `alt=""`.
- **Motion** : `@media (prefers-reduced-motion: reduce)` dans `index.css`.

---

## 4. Critères WCAG — statut Revue n°3

| Critère | Niveau | Statut | Preuve |
|---------|--------|--------|--------|
| 2.1.1 Clavier | A | **OK** | Tableaux + Dialogs / Sheet |
| 2.1.2 Pas de piège clavier | A | **OK** | Radix parcours critique + R1 |
| 2.4.1 Contournement | A | **OK** | Skip link → `#main-content` |
| 2.4.7 Focus visible | A | **OK** | Auth + Settings |
| 1.3.1 Info et relations | A | Partiel OK | h1, describedby ; formulaires secondaires possibles |
| 4.1.2 Nom, rôle, valeur | A | **OK** | Close i18n ; alts ; aria boutons |
| 1.1.1 Images | A | **OK** (socle) | R4 + lot 6 |
| 1.4.3 Contraste | AA | **OK** (socle) | Tokens ; R5 = audit page-par-page optionnel |
| 2.3.3 Motion | AA | **OK** | reduced-motion lot 5 |

---

## 5. Non-conformités initiales — historique (toutes traitées ou hors scope)

Les tickets **C\*** / **S\*** / **M\*** ci-dessous décrivent l’état **avant** remédiation. Statut actuel : **corrigés** (lots 1–6 + R1–R6), sauf **R5** (contraste exhaustif) volontairement hors scope.

### 5.1 Critiques (corrigés)

| ID | Zone | Écart initial | Correctif |
|----|------|---------------|-----------|
| **C1** | Visiteur QR | Modales custom sans trap | Dialogs Radix (lots 1–3) |
| **C2** | Visiteur QR | AudioBanOverlay | AlertDialog Radix |
| **C3** | Auth | Focus ring supprimé | `focus-visible` restauré |
| **C4** | Global | Pas de skip link | `SkipToContentLink` |

### 5.2 Sérieux (corrigés)

| ID | Correctif |
|----|-----------|
| **S1–S12** | Cookies, menu vitrine Sheet (R1), TTS, tableaux clavier, diary describedby, h1 œuvre, sponsors aria-label, ToastClose, reduced-motion, émotions `aria-pressed`, nav header |

### 5.3 Modérés (corrigés / acceptés)

| ID | Statut |
|----|--------|
| **M1–M2** | Alts métier + doc OptimizedImage |
| **M3** | Overlays TTS / Visitor (opacités) |
| **M5** | Close i18n |
| **M6** | Cards focus-visible |
| **M9** | Settings focus |
| **M10** | Swiper opacity |

### 5.4 Mineurs

| ID | Statut |
|----|--------|
| **m3** | AddArtist → Radix (R6 / R1) |
| **m1, m2, m4** | Non bloquants / hors priorité |

---

## 6. Top 15 correctifs — état

Tous les items du plan initial (modales Radix, focus, skip link, cookies, erreurs, tableaux, aria boutons, ToastClose, motion, h1, émotions, nav, contraste tokens, alts, Close i18n) sont **livrés**.

Reste optionnel : smoke axe DevTools, NVDA parcours QR, contraste page-par-page (R5).

---

## 7. Calendrier — exécuté

Phases S0–Gate AA du plan initial : **réalisées** (juillet 2026). Maintenance : nouveaux écrans + checklist PR a11y.

---

## 7bis. Gate A — test express

| # | Test | Résultat |
|---|------|----------|
| 1 | Skip link au 1er Tab | **OK** |
| 2 | Focus visible Login | **OK** |
| 3 | Modale œuvre : trap Tab + Escape | **OK** |
| 4 | Catalogue tableau : Tab + Enter → fiche | **OK** |
| 5 | Reduced-motion (logo) | **OK** |

**Verdict : PASS** — 21 juillet 2026.

---

## 7ter. Gate AA — validation code (21 juillet 2026)

| # | Critère | Preuve code | Résultat |
|---|---------|-------------|----------|
| 1 | Logos / photos avec `alt` nommé | Agences, artistes, expos, users, forms | **OK** |
| 2 | Close Dialog/Sheet i18n | `dialog.tsx` / `sheet.tsx` → `t("close")` | **OK** |
| 3 | Focus switches Settings | `focus-visible:ring-2` | **OK** |
| 4 | Reduced-motion | `index.css` | **OK** |
| 5 | R4 images vitrine / stats | alts i18n / décoratifs `alt=""` | **OK** |

**Verdict Gate AA (socle code) : PASS.**

---

## 8. Dialogs — état final

**Radix (lots 1–3 + R1) :** IndoorAudio, AudioBan, TTS, profil, cookies, VisitorView, carnet, exit diary, AddArtist (fiche + doublon), Expos format, Statistics export, PublicVitrineShell menu (Sheet).

---

## 9. Mise à jour de ce document

| Champ | Valeur |
|-------|--------|
| Version | **Revue n°3 — finale** |
| Gate A | **PASS** 21/07/2026 |
| Gate AA | **PASS** 21/07/2026 |
| R1–R6 | Clos (R5 hors scope volontaire) |
| Prochaine revue | Maintenance a11y / nouveaux écrans |
| Propriétaire suggéré | Front / produit |

*Document versionné — Revue n°3 finale le 21/07/2026.*
