import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PASSWORD_MIN_LENGTH, getPasswordPolicyIssue, isPasswordPolicyOk } from "@/lib/passwordPolicy";

describe("passwordPolicy", () => {
  it("expose bien 8 comme longueur minimale", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("rejette un mot de passe trop court et accepte 8 caractères", () => {
    expect(getPasswordPolicyIssue("1234567")).toBe("too_short");
    expect(isPasswordPolicyOk("1234567")).toBe(false);
    expect(getPasswordPolicyIssue("12345678")).toBeNull();
    expect(isPasswordPolicyOk("12345678")).toBe(true);
  });

  // Garde-fou anti-régression AIM-20 : la validation front (PASSWORD_MIN_LENGTH) et la
  // validation serveur (register-visitor-instant) doivent rester alignées. Un visiteur
  // dont le mot de passe passe le front mais échoue le serveur reçoit une erreur 400
  // "weak_password" que l'UI de signup ne peut pas anticiper.
  it("reste aligné avec le seuil codé en dur côté Edge Function register-visitor-instant", () => {
    const edgeFunctionSource = readFileSync(
      resolve(__dirname, "../../supabase/functions/register-visitor-instant/index.ts"),
      "utf-8",
    );
    const match = edgeFunctionSource.match(/password\.length\s*<\s*(\d+)/);
    expect(match, "seuil de longueur introuvable dans register-visitor-instant/index.ts — le test doit être mis à jour").not.toBeNull();
    const serverMinLength = Number(match?.[1]);
    expect(serverMinLength).toBe(PASSWORD_MIN_LENGTH);
  });
});
