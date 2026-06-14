import {
  STORAGE_BUCKET_PHOTOS,
  buildPhotoObjectPath,
  publicUrlForStorageObject,
} from "@/lib/storagePaths";
import { supabase } from "@/lib/supabase";
import { parseSupabaseStorageObjectRef } from "@/lib/supabaseStorage";

const USER_PHOTO_EXTENSIONS = ["webp", "png", "jpg", "jpeg"] as const;

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

/** Supprime les variantes photos/users/{userId}.* obsolètes après un upload. */
export async function removeStaleUserPhotoExtensions(userId: string, keepExt: string): Promise<void> {
  const uid = userId.trim();
  const keep = keepExt.replace(/^\./, "").toLowerCase();
  if (!uid || !keep) return;

  const paths = USER_PHOTO_EXTENSIONS.filter((ext) => ext !== keep).map((ext) =>
    buildPhotoObjectPath("users", uid, ext),
  );
  if (!paths.length) return;

  try {
    await supabase.storage.from(STORAGE_BUCKET_PHOTOS).remove(paths);
  } catch {
    /* nettoyage best-effort */
  }
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/** True si l'URL est utilisable (HEAD ok pour le storage Supabase, sinon conservée telle quelle). */
export async function isAvatarUrlAvailable(url: string | null | undefined): Promise<boolean> {
  const raw = (url ?? "").trim();
  if (!raw) return false;
  const ref = parseSupabaseStorageObjectRef(raw);
  if (!ref) return true;
  return headOk(raw);
}

/** Vérifie si photos/users/{userId}.{ext} existe déjà (bucket public). */
export async function findCanonicalUserPhotoPublicUrl(userId: string): Promise<string | null> {
  const uid = userId.trim();
  if (!uid) return null;

  for (const ext of USER_PHOTO_EXTENSIONS) {
    const path = buildPhotoObjectPath("users", uid, ext);
    const publicUrl = publicUrlForStorageObject(STORAGE_BUCKET_PHOTOS, path);
    if (await headOk(publicUrl)) return publicUrl;
  }
  return null;
}

/** URL canonique cible pour une photo user (même extension que la source si connue). */
export function buildCanonicalUserPhotoPublicUrl(userId: string, sourceUrl?: string | null): string {
  const ext = sourceUrl?.trim() ? extensionFromPhotoUrl(sourceUrl) : "webp";
  const path = buildPhotoObjectPath("users", userId, ext);
  return publicUrlForStorageObject(STORAGE_BUCKET_PHOTOS, path);
}
