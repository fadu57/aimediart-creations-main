import { readLoginTrackerSession, type VisitorDeviceDetails } from "@/lib/visitorTracking";

const DEFAULT_COUNTRY = "FR";
const DEFAULT_LANG = "fr";

function resolveLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Données tracking inscription depuis l’URL (/login) + session (IP, device, fp de secours).
 * Renseigné lorsque `from=home-tarifs` (parcours vitrine → commencer → login).
 */
export function buildSignupTrackingPayload(searchParams: URLSearchParams): Record<string, unknown> | null {
  const from = searchParams.get("from")?.trim();
  if (from !== "home-tarifs") return null;

  const city = searchParams.get("city")?.trim() || null;
  const zip = searchParams.get("zip")?.trim() || null;
  const countryRaw = searchParams.get("country")?.trim() || DEFAULT_COUNTRY;
  const country =
    countryRaw.length >= 2 ? countryRaw.slice(0, 2).toUpperCase() : DEFAULT_COUNTRY;
  const fpUrl = searchParams.get("fp")?.trim() || null;
  const tz = searchParams.get("tz")?.trim() || resolveLocalTimezone();
  const langFromUrl = searchParams.get("lang")?.trim();

  const session = readLoginTrackerSession();
  const fp = fpUrl || session.fingerprint || null;
  const ip = session.ip?.trim() || null;
  const deviceDetails: VisitorDeviceDetails | null = session.deviceDetails;
  const user_language = (
    langFromUrl ||
    deviceDetails?.language?.trim() ||
    DEFAULT_LANG
  ).slice(0, 64);

  const out: Record<string, unknown> = {
    user_city: city,
    user_zip_code: zip,
    user_country_code: country || DEFAULT_COUNTRY,
    user_language,
    user_fingerprint: fp,
    user_timezone: tz || resolveLocalTimezone(),
  };
  if (ip) out.user_ip_address = ip;
  if (deviceDetails) out.user_device_details = deviceDetails;
  return out;
}
