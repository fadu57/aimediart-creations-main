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

  it("chaque navigate(...) impératif consomme consumePostRegistrationTarget(...)", () => {
    const navigateCalls = source.match(/navigate\(consumePostRegistrationTarget\([^)]*\)[^)]*\)/g) ?? [];
    // 4 sites connus : early-return déjà-enregistré (OAuth), finalisation OAuth, bypass e-mail de
    // test, finalisation e-mail/mot de passe classique. Si ce nombre baisse, une sortie a régressé
    // vers une navigation en dur ; s'il grimpe sans mise à jour de ce test, un nouveau site a été
    // ajouté sans revue de cette garde.
    expect(navigateCalls.length).toBe(4);
  });

  it("le <Navigate> de rendu (session déjà active) consomme aussi la cible mémorisée", () => {
    expect(source).toMatch(/const target = consumePostRegistrationTarget\(/);
    expect(source).toMatch(/<Navigate to=\{target\} replace \/>/);
  });

  it("l'early-return de session déjà active est gardé par !submitting (anti-course avec handleFinalize)", () => {
    expect(source).toMatch(/if \(session && !oauthProfileFlow && !submitting\)/);
  });
});
