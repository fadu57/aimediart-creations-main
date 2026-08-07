/**
 * Consomme (lit puis purge) la page vers laquelle renvoyer un visiteur après une inscription
 * réussie. Priorité à `redirectAfterAuth` (posé par VisitorPageShell/VisitorView au clic sur
 * "S'inscrire"), repli sur `redirectAfterLogin` (posé au clic sur "Se connecter" — cas
 * œuvre → Se connecter → Créer un compte), puis sur `fallback` si rien n'est stocké, si le
 * storage est inaccessible (Safari privé / iframe sandboxée), ou si la valeur n'est pas une URL
 * du même site (évite tout open redirect via une valeur sessionStorage altérée).
 * Effet de bord volontaire : purge toujours les deux clés pour ne pas polluer un flux ultérieur.
 */
export function consumePostRegistrationTarget(fallback: string): string {
  if (typeof window === "undefined") return fallback;

  try {
    const stored =
      sessionStorage.getItem("redirectAfterAuth")?.trim() || sessionStorage.getItem("redirectAfterLogin")?.trim();
    sessionStorage.removeItem("redirectAfterAuth");
    sessionStorage.removeItem("redirectAfterLogin");
    if (!stored) return fallback;

    const url = new URL(stored, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    // Ne pas rebondir sur une page d'auth (boucle register/login), quelle que soit la casse.
    if (/^\/(register|login)(\/|$)/i.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** Purge sans consommer — pour les sorties qui n'utilisent pas la valeur stockée (ex. session déjà active). */
export function clearPostRegistrationTarget(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem("redirectAfterAuth");
    sessionStorage.removeItem("redirectAfterLogin");
  } catch {
    // Storage inaccessible (Safari privé / iframe sandboxée) : rien à purger.
  }
}
