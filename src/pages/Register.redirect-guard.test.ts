import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Garde de non-régression AIM-20 : une revue tier-1 a rejeté un premier correctif de
 * src/pages/Register.tsx car un `replace_all` n'avait remplacé que 2 des 4 (puis 5, une fois
 * le bypass e-mail de test découvert) points de sortie post-inscription par le helper partagé
 * postAuthRedirect.consumePostRegistrationTarget — un `git diff`/tsc/vitest propres n'avaient
 * rien détecté, seule une relecture ligne à ligne l'a repéré. À défaut d'une suite RTL complète
 * (mocking Supabase/router/i18n disproportionné pour ce périmètre), ce test source-scan garantit
 * qu'aucune sortie ne redirige plus jamais vers une cible codée en dur en contournant le helper.
 */
describe("Register.tsx — cohérence des sorties post-inscription", () => {
  const source = readFileSync(resolve(__dirname, "./Register.tsx"), "utf-8");

  it("ne contient qu'une seule occurrence codée en dur de \"/scan-work1\" (le fallback partagé)", () => {
    const occurrences = source.match(/"\/scan-work1"/g) ?? [];
    expect(
      occurrences.length,
      "toute redirection post-inscription doit passer par postRegistrationFallback()/consumePostRegistrationTarget(), pas par une chaîne dupliquée",
    ).toBe(1);
  });

  it("chaque navigate(...) impératif consomme consumePostRegistrationTarget(...) — aucun autre site", () => {
    // Compte le nombre TOTAL de navigate( dans le fichier, pas seulement ceux qui matchent déjà
    // le bon pattern : un 3e commit rejeté avait justement un site de sortie qui n'apparaissait
    // dans aucun des deux comptages précédents (repli implicite, pas de match ni positif ni
    // négatif). Si ce total dépasse le nombre de sites qui consomment le helper, une redirection
    // en dur (navigate("/"), navigate(`/scan-work1?...`), etc.) s'est glissée sans passer dessus.
    const totalNavigateCalls = source.match(/\bnavigate\(/g) ?? [];
    const helperNavigateCalls = source.match(/navigate\(consumePostRegistrationTarget\([^)]*\)[^)]*\)/g) ?? [];
    // 4 sites connus : early-return déjà-enregistré (OAuth), finalisation OAuth, bypass e-mail de
    // test, finalisation e-mail/mot de passe classique. Si ce nombre baisse, une sortie a régressé
    // vers une navigation en dur ; s'il grimpe sans mise à jour de ce test, un nouveau site a été
    // ajouté sans revue de cette garde.
    expect(helperNavigateCalls.length).toBe(4);
    expect(
      totalNavigateCalls.length,
      "un navigate(...) existe dans le fichier sans passer par consumePostRegistrationTarget(...)",
    ).toBe(helperNavigateCalls.length);
  });

  it("le <Navigate> de rendu (session déjà active) consomme aussi la cible mémorisée — aucun autre <Navigate>", () => {
    const totalNavigateElements = source.match(/<Navigate\b/g) ?? [];
    expect(totalNavigateElements.length).toBe(1);
    expect(source).toMatch(/const target = consumePostRegistrationTarget\(/);
    expect(source).toMatch(/<Navigate to=\{target\} replace \/>/);
  });

  it("aucune redirection ne contourne React Router (window.location / location.assign)", () => {
    expect(source).not.toMatch(/window\.location\.(href|assign)\s*=/);
    expect(source).not.toMatch(/location\.assign\(/);
  });

  it("l'early-return de rendu (session déjà active) est gardé par !submitting (anti-course avec handleFinalize)", () => {
    expect(source).toMatch(/if \(session && !oauthProfileFlow && !submitting\)/);
  });

  it("l'effet de retour post-auth (navigate OAuth déjà-enregistré) est aussi gardé par submitting", () => {
    // Revue tier-1 (3e passe) : ce garde manquait sur l'effet, distinct de l'early-return de
    // rendu ci-dessus — un VISITOR_REGISTER_OAUTH_FLAG périmé (tentative Google annulée) pouvait
    // le faire naviguer pendant qu'un parcours e-mail/mot de passe classique finalisait encore.
    expect(source).toMatch(/if \(submitting\) return;/);
    expect(source).toMatch(/\}, \[authLoading, session, searchParams, expoIdFromUrl, navigate, submitting\]\);/);
  });

  it("n'accède jamais directement à sessionStorage (passe par les accesseurs défensifs try/catch)", () => {
    // Revue tier-1 (4e passe) : trois accès sessionStorage bruts n'étaient protégés que par un
    // typeof window !== "undefined", sans try/catch, sur un chemin qui s'exécute pour tout
    // visiteur anonyme atterrissant sur /register — corrigé en passant par
    // hasVisitorRegisterOAuthFlag()/clearVisitorRegisterOAuthFlag() (src/lib/visitorOAuth.ts).
    expect(source).not.toMatch(/sessionStorage/);
  });
});
