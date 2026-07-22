/**
 * aimediartDocuments.ts
 * GED AIMEDIArt : sections dynamiques, sous-dossiers, documents.
 * Buckets : aimediart-legal | aimediart-bp | aimediart-marketing | aimediart-ged.
 * Partage public via edge aimediart-doc-share + route /aimediart-doc-share.
 *
 * Réservé aux admins globaux (role_id 1-3) — contrôle UI + RLS Supabase.
 */

import { supabase } from "./supabase";

/** Slug de section GED (= category documents / dossiers). */
export type AimediartDocCategory = string;

/** Durée de validité d'une URL signée pour prévisualisation (1 heure). */
const SIGNED_URL_TTL_SEC = 3600;

/** Taille maximale par fichier (25 Mo, aligné sur file_size_limit du bucket). */
export const MAX_FILE_SIZE = 26214400;

/** Bucket selon le slug de section. */
export function bucketForCategory(category: string): string {
  if (category === "legal" || category === "legal_inpi" || category === "legal_societe") {
    return "aimediart-legal";
  }
  if (category === "bp") return "aimediart-bp";
  if (category === "marketing") return "aimediart-marketing";
  return "aimediart-ged";
}

/** Préfixe Storage dans le bucket. */
function prefixForCategory(category: string): string {
  if (category === "legal_inpi") return "inpi";
  if (category === "legal_societe") return "societe";
  if (category === "legal") return "legal";
  if (category === "bp" || category === "marketing") return "";
  return slugifyFolderName(category);
}

/** Ligne public.aimediart_ged_sections. */
export type AimediartGedSection = {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  created_at: string;
  created_by: string | null;
};

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

/** Sections visibles dans l’UI (hors legacy). */
const HIDDEN_SECTION_SLUGS = new Set(["legal_inpi", "legal_societe"]);

/** Liste les dossiers principaux (ordre sort_order). */
export async function listGedSections(): Promise<{
  data: AimediartGedSection[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("aimediart_ged_sections")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) return { data: [], error: error.message };
  const rows = ((data as AimediartGedSection[] | null) ?? []).filter(
    (s) => !HIDDEN_SECTION_SLUGS.has(s.slug),
  );
  return { data: rows, error: null };
}

/** Crée un dossier principal. */
export async function createGedSection(
  name: string,
): Promise<{ data: AimediartGedSection | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { data: null, error: "empty_name" };

  let slug = slugifyFolderName(trimmed);
  if (HIDDEN_SECTION_SLUGS.has(slug) || slug === "root") {
    slug = `${slug}-${crypto.randomUUID().slice(0, 8)}`;
  }

  const { data: existing } = await supabase
    .from("aimediart_ged_sections")
    .select("id")
    .ilike("slug", slug)
    .maybeSingle();
  if (existing) {
    slug = `${slug}-${crypto.randomUUID().slice(0, 8)}`;
  }

  const { data: maxRow } = await supabase
    .from("aimediart_ged_sections")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxRow?.sort_order ?? 0) + 10;

  const { data, error } = await supabase
    .from("aimediart_ged_sections")
    .insert({ slug, name: trimmed, sort_order: sortOrder })
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as AimediartGedSection, error: null };
}

/** Renomme un dossier principal (le slug reste stable). */
export async function renameGedSection(
  sectionId: string,
  name: string,
): Promise<{ data: AimediartGedSection | null; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { data: null, error: "empty_name" };

  const { data, error } = await supabase
    .from("aimediart_ged_sections")
    .update({ name: trimmed })
    .eq("id", sectionId)
    .select("*")
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as AimediartGedSection, error: null };
}

/**
 * Supprime un dossier principal vide (ni docs ni sous-dossiers).
 */
export async function deleteGedSection(
  section: Pick<AimediartGedSection, "id" | "slug">,
): Promise<{ error: string | null }> {
  const [{ count: docCount, error: docErr }, { count: folderCount, error: folderErr }] =
    await Promise.all([
      supabase
        .from("aimediart_documents")
        .select("id", { count: "exact", head: true })
        .eq("category", section.slug),
      supabase
        .from("aimediart_document_folders")
        .select("id", { count: "exact", head: true })
        .eq("category", section.slug),
    ]);

  if (docErr) return { error: docErr.message };
  if (folderErr) return { error: folderErr.message };
  if ((docCount ?? 0) > 0 || (folderCount ?? 0) > 0) {
    return { error: "section_not_empty" };
  }

  const { error } = await supabase
    .from("aimediart_ged_sections")
    .delete()
    .eq("id", section.id);

  if (error) return { error: error.message };
  return { error: null };
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

  const bucket = bucketForCategory(category);
  const prefix = prefixForCategory(category);
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
