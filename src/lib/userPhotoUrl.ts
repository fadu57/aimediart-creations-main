import {
  STORAGE_BUCKET_PHOTOS,
  buildPhotoObjectPath,
  publicUrlForStorageObject,
} from "@/lib/storagePaths";
import { parseSupabaseStorageObjectRef } from "@/lib/supabaseStorage";

const USER_PHOTO_SEGMENT = /\/photos\/users\/([0-9a-f-]{36})\.[a-z0-9]+$/i;
const LEGACY_USER_PHOTO_SEGMENT = /\/(?:artist-photos|selfies)\/users(?:\/photos)?\/([0-9a-f-]{36})\.[a-z0-9]+$/i;

/** Extrait l'UUID présent dans le chemin storage d'une photo user backoffice. */
export function userIdFromUserPhotoStorageUrl(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;

  for (const pattern of [USER_PHOTO_SEGMENT, LEGACY_USER_PHOTO_SEGMENT]) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].toLowerCase();
  }

  const ref = parseSupabaseStorageObjectRef(raw);
  if (!ref) return null;
  const usersMatch = ref.path.match(/^users\/([0-9a-f-]{36})\.[a-z0-9]+$/i);
  return usersMatch?.[1]?.toLowerCase() ?? null;
}

/** True si l'URL pointe vers photos/users/{userId}.ext (convention canonique). */
export function isCanonicalUserPhotoUrl(userId: string, url: string | null | undefined): boolean {
  const uid = userId.trim().toLowerCase();
  if (!uid) return false;
  return userIdFromUserPhotoStorageUrl(url) === uid;
}

/** True si l'URL ressemble à une photo catalogue artiste (à ne pas confondre avec un user). */
export function isArtistCatalogPhotoUrl(url: string | null | undefined): boolean {
  const raw = (url ?? "").trim();
  if (!raw) return false;
  return /\/photos\/artists\//i.test(raw) || /\/artist-photos\/(?:artist|artists)\//i.test(raw);
}

function extensionFromPhotoUrl(url: string): string {
  const ref = parseSupabaseStorageObjectRef(url);
  const path = ref?.path ?? url;
  const ext = path.split(".").pop()?.toLowerCase();
  return ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : "webp";
}

/** Vérifie si photos/users/{userId}.{ext} existe déjà (bucket public). */
export async function findCanonicalUserPhotoPublicUrl(userId: string): Promise<string | null> {
  const uid = userId.trim();
  if (!uid) return null;

  for (const ext of ["webp", "png", "jpg", "jpeg"] as const) {
    const path = buildPhotoObjectPath("users", uid, ext);
    const publicUrl = publicUrlForStorageObject(STORAGE_BUCKET_PHOTOS, path);
    try {
      const res = await fetch(publicUrl, { method: "HEAD" });
      if (res.ok) return publicUrl;
    } catch {
      /* réseau / CORS — on essaie l'extension suivante */
    }
  }
  return null;
}

/** URL canonique cible pour une photo user (même extension que la source si connue). */
export function buildCanonicalUserPhotoPublicUrl(userId: string, sourceUrl?: string | null): string {
  const ext = sourceUrl?.trim() ? extensionFromPhotoUrl(sourceUrl) : "webp";
  const path = buildPhotoObjectPath("users", userId, ext);
  return publicUrlForStorageObject(STORAGE_BUCKET_PHOTOS, path);
}
