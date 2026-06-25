/**
 * manualCosts.ts
 * Saisie manuelle de coûts dans ai_usage_events (source='manual_entry')
 * + gestion des documents joints (factures) dans le bucket privé "cost-documents".
 *
 * Réservé aux admins coûts (role_id 1-2) — contrôle côté UI + RLS Supabase.
 */

import { supabase } from "./supabase";

export const COST_DOCUMENTS_BUCKET = "cost-documents";
export const MANUAL_COST_SOURCE = "manual_entry";

/** Durée de validité d'une URL signée de document (1 heure). */
const SIGNED_URL_TTL_SEC = 3600;

/** Document joint : chemin dans le bucket + nom d'origine. */
export type CostDocument = {
  path: string;
  name: string;
};

export type ManualCostInput = {
  /** Date du coût (YYYY-MM-DD) — sert de created_at à midi UTC. */
  date: string;
  /** Libellé court affiché dans la colonne « Opération ». */
  label: string;
  /** Fournisseur (clé libre : ovh, freelance, hébergement…). */
  provider: string;
  /** Catégorie fonctionnelle (tool_type) : infrastructure, service, autre… */
  toolType: string;
  /** Montant TTC dans la devise choisie. */
  amount: number;
  currency: string;
  /** N° de facture / référence (optionnel). */
  invoiceRef?: string;
  /** Note libre (optionnel). */
  note?: string;
  /** Documents joints (liste — état final souhaité). */
  documents?: CostDocument[];
};

/** Métadonnées typées d'une saisie manuelle (sous-ensemble de metadata jsonb). */
export type ManualCostMetadata = {
  manual: true;
  label?: string;
  invoice_ref?: string;
  note?: string;
  /** Liste des documents joints. */
  documents?: CostDocument[];
  /** Champs hérités (ancien format mono-document) — lus mais plus écrits. */
  document_path?: string;
  document_name?: string;
};

function slugifyFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60) || "document";
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return ext ? `${base}.${ext}` : base;
}

/**
 * Téléverse un document (facture) dans le bucket privé.
 * Retourne le chemin de stockage (à conserver dans metadata.document_path).
 */
export async function uploadCostDocument(
  file: File,
): Promise<{ path: string; name: string; error: string | null }> {
  const safeName = slugifyFileName(file.name);
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from(COST_DOCUMENTS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });

  if (error) return { path: "", name: file.name, error: error.message };
  return { path, name: file.name, error: null };
}

/** Supprime un document du bucket (sans bloquer en cas d'échec). */
export async function deleteCostDocument(path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from(COST_DOCUMENTS_BUCKET).remove([path]).catch(() => undefined);
}

/** URL signée temporaire pour consulter/télécharger un document joint. */
export async function getCostDocumentSignedUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(COST_DOCUMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Construit l'objet metadata d'une saisie manuelle. */
function buildManualMetadata(input: ManualCostInput): ManualCostMetadata {
  const metadata: ManualCostMetadata = { manual: true, label: input.label };
  if (input.invoiceRef?.trim()) metadata.invoice_ref = input.invoiceRef.trim();
  if (input.note?.trim()) metadata.note = input.note.trim();
  const docs = (input.documents ?? []).filter((d) => d.path);
  if (docs.length > 0) metadata.documents = docs;
  return metadata;
}

/** Insère une saisie manuelle de coût dans ai_usage_events. */
export async function createManualCost(
  input: ManualCostInput,
): Promise<{ id: string | null; error: string | null }> {
  const metadata = buildManualMetadata(input);

  const { data, error } = await supabase
    .from("ai_usage_events")
    .insert({
      created_at: `${input.date}T12:00:00.000Z`,
      tool_type: input.toolType,
      provider: input.provider.trim().toLowerCase(),
      api_name: "manual",
      operation_name: input.label,
      cost_estimated: input.amount,
      currency: input.currency,
      status: "success",
      source: MANUAL_COST_SOURCE,
      metadata,
    })
    .select("id")
    .single();

  if (error) return { id: null, error: error.message };
  return { id: (data as { id: string }).id, error: null };
}

/**
 * Met à jour une saisie manuelle existante (source='manual_entry' uniquement).
 * `input.documents` reflète l'état final souhaité des documents joints.
 */
export async function updateManualCost(
  id: string,
  input: ManualCostInput,
): Promise<{ error: string | null }> {
  const metadata = buildManualMetadata(input);

  const { error } = await supabase
    .from("ai_usage_events")
    .update({
      created_at: `${input.date}T12:00:00.000Z`,
      tool_type: input.toolType,
      provider: input.provider.trim().toLowerCase(),
      operation_name: input.label,
      cost_estimated: input.amount,
      currency: input.currency,
      metadata,
    })
    .eq("id", id)
    .eq("source", MANUAL_COST_SOURCE);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Met à jour uniquement les documents joints (metadata.documents) d'un coût,
 * SANS toucher aux autres champs ni à la source.
 * Fonctionne pour n'importe quel coût (manuel OU automatique : OVH, Supabase, IA…).
 * Réservé aux admins coûts (role_id 1-2) — garde-fou RLS côté base.
 */
export async function updateCostDocuments(
  id: string,
  documents: CostDocument[],
  currentMetadata?: Record<string, unknown> | null,
): Promise<{ error: string | null }> {
  const meta: Record<string, unknown> = { ...(currentMetadata ?? {}) };
  // On migre l'éventuel ancien format mono-document vers le tableau.
  delete meta.document_path;
  delete meta.document_name;
  const docs = documents.filter((d) => d.path);
  if (docs.length > 0) meta.documents = docs;
  else delete meta.documents;

  const { error } = await supabase
    .from("ai_usage_events")
    .update({ metadata: meta })
    .eq("id", id);

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Supprime une saisie manuelle (et ses documents joints éventuels).
 * Ne supprime que les lignes source='manual_entry' (garde-fou RLS côté base).
 */
export async function deleteManualCost(
  id: string,
  documentPaths?: string[] | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("ai_usage_events")
    .delete()
    .eq("id", id)
    .eq("source", MANUAL_COST_SOURCE);

  if (error) return { error: error.message };
  for (const p of documentPaths ?? []) await deleteCostDocument(p);
  return { error: null };
}

/**
 * Extrait la liste des documents joints depuis le metadata d'un événement.
 * Gère l'ancien format mono-document (document_path / document_name).
 */
export function manualCostDocuments(
  metadata: Record<string, unknown> | null | undefined,
): CostDocument[] {
  const raw = metadata?.documents;
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (d): d is CostDocument =>
          !!d && typeof (d as CostDocument).path === "string" && (d as CostDocument).path.trim() !== "",
      )
      .map((d) => ({ path: d.path, name: typeof d.name === "string" && d.name ? d.name : d.path }));
  }
  const legacy = metadata?.document_path;
  if (typeof legacy === "string" && legacy.trim() !== "") {
    const name = metadata?.document_name;
    return [{ path: legacy, name: typeof name === "string" && name ? name : legacy }];
  }
  return [];
}

/** Vrai si l'événement est une saisie manuelle. */
export function isManualCostEvent(event: { source: string | null }): boolean {
  return event.source === MANUAL_COST_SOURCE;
}
