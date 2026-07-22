/**
 * aimediartDocuments.ts
 * Gestion des documents internes AIMEDIArt (Légal/INPI/Société, BP, Marketing).
 * Métadonnées dans public.aimediart_documents, dossiers dans aimediart_document_folders,
 * fichiers dans 3 buckets privés. Partage public via edge aimediart-doc-share.
 *
 * Réservé aux admins globaux (role_id 1-3) — contrôle UI + RLS Supabase.
 */

import { supabase } from "./supabase";

/** Catégories de documents (= sous-sections de la page). */
export type AimediartDocCategory =
  | "legal"
  | "legal_inpi"
  | "legal_societe"
  | "bp"
  | "marketing";

/** Bucket privé associé à chaque catégorie. */
export const BUCKET_BY_CATEGORY: Record<AimediartDocCategory, string> = {
  legal: "aimediart-legal",
  legal_inpi: "aimediart-legal",
  legal_societe: "aimediart-legal",
  bp: "aimediart-bp",
  marketing: "aimediart-marketing",
};

/** Préfixe (dossier) dans le bucket — sépare les axes dans le bucket légal. */
const PREFIX_BY_CATEGORY: Record<AimediartDocCategory, string> = {
  legal: "legal",
  legal_inpi: "inpi",
  legal_societe: "societe",
  bp: "",
  marketing: "",
};

/** Durée de validité d'une URL signée pour prévisualisation (1 heure). */
const SIGNED_URL_TTL_SEC = 3600;

/** Taille maximale par fichier (25 Mo, aligné sur file_size_limit du bucket). */
export const MAX_FILE_SIZE = 26214400;

/** Ligne de la table aimediart_document_folders. */
export type AimediartDocumentFolder = {
  id: string;
  category: AimediartDocCategory;
  name: string;
  created_at: string;
  created_by: string | null;
};

/** Ligne de la table aimediart_documents. */
export type AimediartDocument = {
  id: string;
  category: AimediartDocCategory;
  folder_id: string | null;
  share_token: string;
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

function slugifyFolderName(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 40) || "dossier"
  );
}

/** Liste les sous-dossiers d'une catégorie (ordre alphabétique). */
export async function listFolders(
  category: AimediartDocCategory,
): Promise<{ data: AimediartDocumentFolder[]; error: string | null }> {
  const { data, error } = await supabase
    .from("aimediart_document_folders")
    .select("*")
    .eq("category", category)
    .order("name", { ascending: true });

  if (error) return { data: [], error: error.message };
  return { data: (data as AimediartDocumentFolder[] | null) ?? [], error: null };
}

/** Crée un sous-dossier dans une catégorie. */
export async function createFolder(
  category: AimediartDocCategory,
  name: string,
): Promise<{ data: AimediartDocumentFolder | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { data: null, error: "empty_name" };

  const { data, error } = await supabase
    .from("aimediart_document_folders")
    .insert({ category, name: trimmed })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as AimediartDocumentFolder, error: null };
}

/** Renomme un sous-dossier (unicité par catégorie, insensible à la casse). */
export async function renameFolder(
  folderId: string,
  name: string,
): Promise<{ data: AimediartDocumentFolder | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { data: null, error: "empty_name" };

  const { data, error } = await supabase
    .from("aimediart_document_folders")
    .update({ name: trimmed })
    .eq("id", folderId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as AimediartDocumentFolder, error: null };
}

/**
 * Supprime un sous-dossier vide.
 * Échoue si des documents y sont encore rattachés (FK restrict).
 */
export async function deleteFolder(
  folder: Pick<AimediartDocumentFolder, "id">,
): Promise<{ error: string | null }> {
  const { count, error: countErr } = await supabase
    .from("aimediart_documents")
    .select("id", { count: "exact", head: true })
    .eq("folder_id", folder.id);

  if (countErr) return { error: countErr.message };
  if ((count ?? 0) > 0) return { error: "folder_not_empty" };

  const { error } = await supabase
    .from("aimediart_document_folders")
    .delete()
    .eq("id", folder.id);

  if (error) return { error: error.message };
  return { error: null };
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
  folderId: string | null = null,
  folderNameForPath: string | null = null,
): Promise<{ data: AimediartDocument | null; error: string | null }> {
  if (file.size > MAX_FILE_SIZE) {
    return { data: null, error: "file_too_big" };
  }

  const bucket = BUCKET_BY_CATEGORY[category];
  const prefix = PREFIX_BY_CATEGORY[category];
  const folderSeg = folderNameForPath ? slugifyFolderName(folderNameForPath) : "root";
  const safeName = slugifyFileName(file.name);
  const year = new Date().getFullYear();
  const path = `${prefix ? `${prefix}/` : ""}${folderSeg}/${year}/${crypto.randomUUID()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upErr) return { data: null, error: upErr.message };

  const { data, error: insErr } = await supabase
    .from("aimediart_documents")
    .insert({
      category,
      folder_id: folderId,
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

/** Déplace un document vers un autre dossier (ou racine si folderId null). */
export async function moveDocument(
  docId: string,
  folderId: string | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("aimediart_documents")
    .update({ folder_id: folderId })
    .eq("id", docId);

  if (error) return { error: error.message };
  return { error: null };
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

/** URL signée temporaire pour prévisualiser/télécharger un document (auth admin). */
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

/** Domaine public de partage GED (jamais localhost). */
const PUBLIC_SHARE_SITE_DEFAULT = "https://www.aimediart.com";

/**
 * Lien de partage public stable sur le domaine du site.
 * Ex. https://www.aimediart.com/aimediart-doc-share?t=<token>
 * La page redirige vers l’edge (URL signée) — pas d’auth requise.
 */
export function getDocumentShareUrl(shareToken: string): string | null {
  if (!shareToken) return null;
  const fromEnv = import.meta.env.VITE_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ?? "";
  const site =
    fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)
      ? fromEnv
      : PUBLIC_SHARE_SITE_DEFAULT;
  return `${site}/aimediart-doc-share?t=${encodeURIComponent(shareToken)}`;
}
