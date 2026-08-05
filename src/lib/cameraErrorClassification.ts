/**
 * Classification de l'échec d'accès caméra (AIM-31, VIS-SCA-02/M2).
 *
 * Distingue un refus de permission (permanent tant que le réglage navigateur
 * n'est pas changé) d'une indisponibilité technique réelle (caméra absente,
 * déjà utilisée par une autre appli) — afin de ne jamais afficher un message
 * d'"indisponibilité temporaire" pour un refus permanent.
 *
 * `error.name` (DOMException) est priorisé sur `error.message` : certains
 * user agents renvoient un `message` vide pour `NotAllowedError`, ce qui
 * faisait échouer le seul filtrage par regex sur le message et retombait
 * silencieusement sur "unknown" — la cause racine du message trompeur.
 * Le filtrage par message reste en repli pour les erreurs ré-emballées par
 * html5-qrcode, qui ne préservent pas toujours `.name`.
 */
export type CameraErrorKind = "denied" | "not_found" | "in_use" | "unknown";

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

export function classifyCameraError(error: unknown): CameraErrorKind {
  const name = errorName(error);
  const message = errorMessage(error);

  if (
    /^(NotAllowedError|PermissionDeniedError)$/i.test(name) ||
    /permission|denied|notallowed|not allowed/i.test(message)
  ) {
    return "denied";
  }

  if (
    /^(NotFoundError|DevicesNotFoundError)$/i.test(name) ||
    /notfound|no camera|device not found|requested device not found/i.test(message)
  ) {
    return "not_found";
  }

  if (
    /^(NotReadableError|TrackStartError)$/i.test(name) ||
    /notreadable|in use|busy|track start/i.test(message)
  ) {
    return "in_use";
  }

  return "unknown";
}
