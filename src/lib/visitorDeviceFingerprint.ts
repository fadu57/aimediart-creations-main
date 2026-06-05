/**
 * Empreinte appareil cross-navigateur.
 *
 * Utilise uniquement des signaux hardware/OS stables quel que soit le navigateur :
 * résolution, profondeur couleur, CPU, plateforme, timezone, touchpoints.
 *
 * Contrairement au visitorId FingerprintJS (stable par navigateur uniquement),
 * ce hash permet une reconnaissance probabiliste sur un même appareil même si
 * le visiteur change de navigateur (Chrome → Firefox, etc.).
 *
 * Limites : collisions possibles sur desktop avec résolutions courantes (1920×1080).
 * Utiliser en complément de visitorId + visitor_client_id, jamais seul.
 */

/** Construit un hash léger à partir de signaux hardware/OS uniquement. */
export function buildDeviceFingerprint(): string {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "";

  try {
    // OS/plateforme (ex. "Win32", "MacIntel", "Linux x86_64", "iPhone")
    const platform =
      (navigator as unknown as { userAgentData?: { platform?: string } })
        .userAgentData?.platform?.trim() ||
      navigator.platform?.trim() ||
      "";

    const parts = [
      // Écran — hardware-bound
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      // CPU — idem
      String(navigator.hardwareConcurrency ?? 0),
      // OS/plateforme — sans info navigateur
      platform,
      // Fuseau horaire — stable par région
      Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
      // Touchpoints — discriminant mobile/tablette/desktop
      String(navigator.maxTouchPoints ?? 0),
    ];

    const raw = parts.join("|");

    // Hash simple 32 chars, alphanumérique, sans dépendance externe
    return btoa(unescape(encodeURIComponent(raw)))
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 32);
  } catch {
    return "";
  }
}
