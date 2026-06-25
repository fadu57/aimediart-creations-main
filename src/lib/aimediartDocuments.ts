/**
 * aimediartDocuments.ts
 * Gestion des documents internes AIMEDIArt (Légal/INPI/Société, BP, Marketing).
 * Métadonnées dans public.aimediart_documents, fichiers dans 3 buckets privés.
 *
 * Réservé aux admins globaux (role_id 1-3) — contrôle UI + RLS Supabase.
 */

import { supabase } from "./supabase";

/** Catégories de documents (= sous-sections de la page). */
export type AimediartDocCategory =
  | "legal_inpi"
  | "legal_societe"
  | "bp"
  | "marketing";

/** Bucket privé associé à chaque catégorie. */
export const BUCKET_BY_CATEGORY: Record<AimediartDocCategory, string> = {
  legal_inpi: "aimediart-legal",
  legal_societe: "aimediart-legal",
  bp: "aimediart-bp",
  marketing: "aimediart-marketing",
};

/** Préfixe (dossier) dans le bucket — sépare INPI et Société dans le bucket légal. */
const PREFIX_BY_CATEGORY: Record<AimediartDocCategory, string> = {
  legal_inpi: "inpi",
  legal_societe: "societe",
  bp: "",
  marketing: "",
};

/** Durée de validité d'une URL signée (1 heure). */
const SIGNED_URL_TTL_SEC = 3600;

/** Taille maximale par fichier (25 Mo, aligné sur file_size_limit du bucket). */
export const MAX_FILE_SIZE = 26214400;

/** Ligne de la table aimediart_documents. */
export type AimediartDocument = {
  id: string;
  category: AimediartDocCategory;
  bucket: string;
  path: string;
  name: string;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
  created_by: string | null;
};

function slugifyFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base =
    (dot > 0 ? name.slice(0, dot) : name)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "document";
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return ext ? `${base}.${ext}` : base;
}

/** Liste les documents d'une catégorie (les plus récents en premier). */
export async function listDocuments(
  category: AimediartDocCategory,
): Promise<{ data: AimediartDocument[]; error: string | null }> {
  const { data, error } = await supabase
    .from("aimediart_documents")
    .select("*")
    .eq("category", category)
    .order("created_at", { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: (data as AimediartDocument[] | null) ?? [], error: null };
}

/**
 * Téléverse un fichier dans le bon bucket puis enregistre sa ligne de métadonnées.
 * En cas d'échec de l'insert, le fichier téléversé est nettoyé.
 */
export async function uploadDocument(
  category: AimediartDocCategory,
  file: File,
): Promise<{ data: AimediartDocument | null; error: string | null }> {
  if (file.size > MAX_FILE_SIZE) {
    return { data: null, error: "file_too_big" };
  }

  const bucket = BUCKET_BY_CATEGORY[category];
  const prefix = PREFIX_BY_CATEGORY[category];
  const safeName = slugifyFileName(file.name);
  const year = new Date().getFullYear();
  const path = `${prefix ? `${prefix}/` : ""}${year}/${crypto.randomUUID()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upErr) return { data: null, error: upErr.message };

  const { data, error: insErr } = await supabase
    .from("aimediart_documents")
    .insert({
      category,
      bucket,
      path,
      name: file.name,
      size_bytes: file.size,
      mime_type: file.type || null,
    })
    .select("*")
    .single();

  if (insErr) {
    await supabase.storage.from(bucket).remove([path]).catch(() => undefined);
    return { data: null, error: insErr.message };
  }

  return { data: data as AimediartDocument, error: null };
}

/** Supprime un document (ligne + fichier du bucket). */
export async function deleteDocument(
  doc: Pick<AimediartDocument, "id" | "bucket" | "path">,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("aimediart_documents").delete().eq("id", doc.id);
  if (error) return { error: error.message };
  await supabase.storage.from(doc.bucket).remove([doc.path]).catch(() => undefined);
  return { error: null };
}

/** URL signée temporaire pour consulter/télécharger un document. */
export async function getDocumentSignedUrl(
  bucket: string,
  path: string,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
