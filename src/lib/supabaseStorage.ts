import { supabase } from "@/lib/supabase";

/** Extrait bucket + chemin depuis une URL publique Supabase Storage. */
export function parseSupabaseStoragePublicUrl(publicUrl: string): { bucket: string; path: string } | null {
  const trimmed = publicUrl.trim();
  if (!trimmed) return null;

  try {
    const u = new URL(trimmed);
    const marker = "/storage/v1/object/public/";
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    const rest = u.pathname.slice(idx + marker.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    return {
      bucket: rest.slice(0, slash),
      path: decodeURIComponent(rest.slice(slash + 1)),
    };
  } catch {
    return null;
  }
}

/** Supprime un objet storage à partir de son URL publique (ignore les erreurs). */
export async function removeSupabaseStorageObjectByPublicUrl(publicUrl: string): Promise<void> {
  const parsed = parseSupabaseStoragePublicUrl(publicUrl);
  if (!parsed) return;
  await supabase.storage.from(parsed.bucket).remove([parsed.path]).catch(() => undefined);
}
