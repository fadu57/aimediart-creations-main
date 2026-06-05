/**
 * Métadonnées navigateur pour statistiques / support (analytics uniquement).
 * Ne servent pas à identifier un visiteur anonyme : la reconnaissance repose sur
 * FingerprintJS (visitorId) et visitor_client_id, pas sur user_agent ni résolution écran.
 */

function guessBrowserName(uaRaw: string): string | null {
  const ua = uaRaw.trim();
  if (!ua) return null;
  if (/edg/i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/chrome|crios|chromium/i.test(ua)) return "Chrome";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  return null;
}

export type VisitorDeviceHintsForDb = {
  p_user_agent: string | null;
  p_browser_name: string | null;
  p_device_type: string | null;
  p_screen_resolution: string | null;
};

/** @deprecated Utiliser getVisitorDeviceAnalyticsHints — ancien nom trompeur (« fingerprint »). */
export function getVisitorDeviceFingerprintHints(): VisitorDeviceHintsForDb {
  return getVisitorDeviceAnalyticsHints();
}

export function getVisitorDeviceAnalyticsHints(): VisitorDeviceHintsForDb {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return { p_user_agent: null, p_browser_name: null, p_device_type: null, p_screen_resolution: null };
  }
  const userAgentFull = navigator.userAgent?.trim() || "";
  const ua = userAgentFull.slice(0, 4000);
  let deviceType = "desktop";
  try {
    const coarse = navigator.userAgentData?.mobile;
    if (coarse === true) deviceType = "mobile";
    else if (coarse === false) deviceType = "desktop";
    else if (/tablet|ipad/i.test(userAgentFull)) deviceType = "tablet";
    else if (/mobile|android|iphone|ipod/i.test(userAgentFull)) deviceType = "mobile";
  } catch {
    deviceType = /mobile|android|iphone|ipad|ipod/i.test(userAgentFull) ? "mobile" : "desktop";
  }

  let screenResolution: string | null = null;
  try {
    if (typeof screen !== "undefined" && screen.width && screen.height) {
      screenResolution = `${screen.width}x${screen.height}`;
      if (screenResolution.length > 64) screenResolution = screenResolution.slice(0, 64);
    }
  } catch {
    screenResolution = null;
  }

  return {
    p_user_agent: ua || null,
    p_browser_name: guessBrowserName(userAgentFull),
    p_device_type: deviceType,
    p_screen_resolution: screenResolution,
  };
}
