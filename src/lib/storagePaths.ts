import { supabase } from "@/lib/supabase";

/** Buckets canoniques (cible après migration storage). */
export const STORAGE_BUCKET_LOGOS = "logos" as const;
export const STORAGE_BUCKET_PHOTOS = "photos" as const;

/** Buckets legacy — lecture seule, plus d’upload. */
export const LEGACY_BUCKETS = ["artist-photos", "selfies", "avatars", "images"] as const;

export type StoragePhotoKind = "artists" | "users" | "visitors" | "avatars";
export type StorageLogoKind = "agencies" | "expos";

/** Chemin canonique photos/{kind}/{entityId}.{ext} */
export function buildPhotoObjectPath(kind: StoragePhotoKind, entityId: string, ext: string): string {
  const id = entityId.trim();
  const safeExt = (ext.replace(/^\./, "") || "webp").toLowerCase();
  return `${kind}/${id}.${safeExt}`;
}

/** Chemin canonique logos/{kind}/{entityId}.{ext} */
export function buildLogoObjectPath(kind: StorageLogoKind, entityId: string, ext: string): string {
  const id = entityId.trim();
  const safeExt = (ext.replace(/^\./, "") || "webp").toLowerCase();
  return `${kind}/${id}.${safeExt}`;
}

export function extensionFromFileName(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "webp";
}

export function publicUrlForStorageObject(bucket: string, objectPath: string): string {
  const path = objectPath.replace(/^\/+/, "");
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl || "";
}

type UploadOptions = {
  upsert?: boolean;
  cacheControl?: string;
};

/** Upload vers un bucket canonique ; retourne l’URL publique. */
export async function uploadToStorageBucket(
  bucket: string,
  objectPath: string,
  body: File | Blob,
  options: UploadOptions = {},
): Promise<string> {
  const path = objectPath.replace(/^\/+/, "");
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    cacheControl: options.cacheControl ?? "3600",
    upsert: options.upsert ?? false,
  });
  if (error) throw error;
  return publicUrlForStorageObject(bucket, path);
}

export async function uploadCatalogArtistPhoto(
  artistId: string,
  file: File | Blob,
  fileName?: string,
): Promise<string> {
  const ext = fileName ? extensionFromFileName(fileName) : "webp";
  const path = buildPhotoObjectPath("artists", artistId, ext);
  return uploadToStorageBucket(STORAGE_BUCKET_PHOTOS, path, file, { upsert: true });
}

export async function uploadBackofficeUserPhoto(userId: string, file: File | Blob, fileName?: string): Promise<string> {
  const ext = fileName ? extensionFromFileName(fileName) : "webp";
  const path = buildPhotoObjectPath("users", userId, ext);
  return uploadToStorageBucket(STORAGE_BUCKET_PHOTOS, path, file, { upsert: true });
}

export async function uploadVisitorSelfiePhoto(userId: string, file: File | Blob, fileName?: string): Promise<string> {
  const ext = fileName ? extensionFromFileName(fileName) : "webp";
  const path = buildPhotoObjectPath("visitors", userId, ext);
  return uploadToStorageBucket(STORAGE_BUCKET_PHOTOS, path, file, { upsert: true });
}

export async function uploadVisitorAnonymousAvatar(
  userId: string,
  file: File | Blob,
  fileName?: string,
): Promise<string> {
  const ext = fileName ? extensionFromFileName(fileName) : "webp";
  const path = buildPhotoObjectPath("avatars", userId, ext);
  return uploadToStorageBucket(STORAGE_BUCKET_PHOTOS, path, file, { upsert: true });
}

export async function uploadAgencyLogo(agencyId: string, file: File | Blob, fileName?: string): Promise<string> {
  const ext = fileName ? extensionFromFileName(fileName) : "webp";
  const path = buildLogoObjectPath("agencies", agencyId, ext);
  return uploadToStorageBucket(STORAGE_BUCKET_LOGOS, path, file, { upsert: true });
}

export async function uploadExpoLogo(expoId: string, file: File | Blob, fileName?: string): Promise<string> {
  const ext = fileName ? extensionFromFileName(fileName) : "webp";
  const path = buildLogoObjectPath("expos", expoId, ext);
  return uploadToStorageBucket(STORAGE_BUCKET_LOGOS, path, file, { upsert: true });
}

/**
 * Normalise une URL storage pour l’affichage.
 * Accepte les URLs legacy (artist-photos, selfies, avatars) et les nouvelles (logos, photos).
 */
export function normalizeStoragePublicUrl(url: string | null | undefined): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  if (raw.includes("/object/public/")) return raw;
  return raw
    .replace("/storage/v1/object/authenticated/", "/storage/v1/object/public/")
    .replace("/storage/v1/object/images/", "/storage/v1/object/public/images/");
}
