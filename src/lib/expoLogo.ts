import { supabase } from "@/lib/supabase";

function coerceLogoString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/**
 * Lit la meilleure valeur logo sur une ligne `expos` (colonnes variables selon les migrations).
 */
export function expoLogoRawFromRow(row: Record<string, unknown>): string | null {
  const priority = [
    "logo_expo",
    "logo2_expo",
    "expo_logo",
    "logo_url",
    "expo_logo_url",
    "image_url",
    "cover_url",
    "expo_image_url",
    "photo_expo",
  ];
  for (const k of priority) {
    const s = coerceLogoString(row[k]);
    if (s) return s;
  }
  for (const key of Object.keys(row)) {
    if (!/(logo|image|cover|photo|thumb|banner)/i.test(key)) continue;
    const s = coerceLogoString(row[key]);
    if (!s) continue;
    if (s.startsWith("http") || s.startsWith("/") || s.startsWith("data:")) return s;
    if (s.includes("/")) return s;
  }
  return null;
}

/** Transforme une valeur base (URL complète ou chemin storage) en URL affichable. */
export function resolveExpoLogoImgSrc(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t) || t.startsWith("data:") || t.startsWith("blob:")) return t;
  if (t.startsWith("/")) return t;
  const path = t.replace(/^\/+/, "");
  const { data } = supabase.storage.from("images").getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Pour l’affichage liste : si l’URL storage n’a pas encore de `?v=`,
 * on ajoute un cache-bust basé sur un jeton stable (ex. updated_at / id) pour forcer le refresh navigateur.
 */
export function resolveExpoLogoImgSrcForDisplay(
  raw: string | null | undefined,
  cacheToken?: string | number | null,
): string {
  const base = resolveExpoLogoImgSrc((raw ?? "").trim());
  if (!base || base.startsWith("data:") || base.startsWith("blob:")) return base;
  if (/[?&]v=/.test(base)) return base;
  if (cacheToken == null || String(cacheToken).trim() === "") return base;
  try {
    const parsed = new URL(base);
    parsed.searchParams.set("v", String(cacheToken));
    return parsed.toString();
  } catch {
    const clean = base.split("?")[0] ?? base;
    return `${clean}?v=${encodeURIComponent(String(cacheToken))}`;
  }
}
