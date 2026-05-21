import { supabase } from "@/lib/supabase";
import {
  LEGACY_BUCKETS,
  STORAGE_BUCKET_LOGOS,
  STORAGE_BUCKET_PHOTOS,
  normalizeStoragePublicUrl,
} from "@/lib/storagePaths";

/** @deprecated Utiliser STORAGE_BUCKET_PHOTOS — conservé pour URLs legacy. */
export const ARTIST_PHOTOS_BUCKET =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SUPABASE_ARTIST_PHOTOS_BUCKET?.trim()) ||
  "artist-photos";

/** Buckets pour résoudre une URL relative ou legacy à l'affichage. */
function storageBucketCandidates(): string[] {
  return [
    STORAGE_BUCKET_PHOTOS,
    STORAGE_BUCKET_LOGOS,
    ...LEGACY_BUCKETS,
    ARTIST_PHOTOS_BUCKET,
  ];
}

/** Rend une URL Supabase Storage affichable côté client (bucket public). */
export function toPublicStorageUrl(url: string | null | undefined): string {
  return normalizeStoragePublicUrl(url);
}
/** Extrait bucket + chemin depuis une URL storage Supabase (public, authenticated ou sign). */
export function parseSupabaseStorageObjectRef(
  url: string | null | undefined,
): { bucket: string; path: string } | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    const bucket = STORAGE_BUCKET_PHOTOS;
    return { bucket, path: raw.replace(/^\/+/, "") };
  }

  const fromPublic = parseSupabaseStoragePublicUrl(raw);
  if (fromPublic) return fromPublic;

  try {
    const u = new URL(raw);
    for (const marker of ["/storage/v1/object/authenticated/", "/storage/v1/object/sign/"] as const) {
      const idx = u.pathname.indexOf(marker);
      if (idx === -1) continue;
      const rest = u.pathname.slice(idx + marker.length);
      const slash = rest.indexOf("/");
      if (slash <= 0) continue;
      return {
        bucket: rest.slice(0, slash),
        path: decodeURIComponent(rest.slice(slash + 1)),
      };
    }
  } catch {
    return null;
  }
  return null;
}

/** Construit une URL affichable pour avatar (URL complète, chemin relatif ou métadonnée). */
export function resolveAvatarDisplayUrl(stored: string | null | undefined): string {
  const raw = (stored ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return toPublicStorageUrl(raw);

  const path = raw.replace(/^\/+/, "");
  for (const bucket of storageBucketCandidates()) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    if (data.publicUrl) return data.publicUrl;
  }

  const ref = parseSupabaseStorageObjectRef(raw);
  if (!ref) return raw;
  const { data } = supabase.storage.from(ref.bucket).getPublicUrl(ref.path);
  return data.publicUrl || toPublicStorageUrl(raw);
}

/** URL signée si le bucket n'est pas public (fallback affichage). */
export async function createSignedAvatarUrl(
  stored: string | null | undefined,
  expiresSec = 3600,
): Promise<string> {
  const raw = (stored ?? "").trim();
  if (!raw) return "";

  const refs: Array<{ bucket: string; path: string }> = [];
  const parsed = parseSupabaseStorageObjectRef(raw) ?? parseSupabaseStorageObjectRef(resolveAvatarDisplayUrl(raw));
  if (parsed) refs.push(parsed);

  if (!/^https?:\/\//i.test(raw)) {
    const path = raw.replace(/^\/+/, "");
    for (const bucket of storageBucketCandidates()) {
      refs.push({ bucket, path });
    }
  }

  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.bucket}:${ref.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, expiresSec);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return "";
}

export function readAvatarFromMeta(meta: Record<string, unknown> | null | undefined): string {
  if (!meta) return "";
  for (const key of ["avatar_url", "user_photo_url", "picture", "photo_url"] as const) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

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
