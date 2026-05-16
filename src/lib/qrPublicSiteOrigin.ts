import { supabase } from "@/lib/supabase";
import { SETTINGS_KEYS } from "@/lib/settingsKeys";

/**
 * Préfixe d’URL saisi en configuration (champ #settings-site-qr_origin, clé JSON `public_site_origin`
 * dans `app_settings.key` = `settings_general_links_qr`).
 *
 * Les QR œuvre se construisent ainsi : `{préfixe}/artwork/{artwork_id}` + `?expo_id=…` si exposition liée.
 */
export async function fetchQrPublicSiteOriginFromSettings(): Promise<string> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEYS.generalLinksQr)
    .maybeSingle();
  if (error) return "";
  const rawValue = typeof data?.value === "string" ? data.value : "";
  if (!rawValue.trim()) return "";
  try {
    const parsed = JSON.parse(rawValue) as { public_site_origin?: string | null };
    return (parsed.public_site_origin ?? "").trim();
  } catch {
    return "";
  }
}
