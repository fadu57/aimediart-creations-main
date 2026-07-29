/**
 * Catalogue des documents « création entreprise » (espace Juridique).
 * Contenu HTML FR : src/content/creationEntreprise/docs.fr.ts
 */

import {
  CREATION_ENTREPRISE_DOCS,
  CREATION_ENTREPRISE_SLUGS,
  type CreationEntrepriseSlug,
} from "@/content/creationEntreprise/docs.fr";
import type { LegalPageSlug } from "@/lib/legalDocuments";

export type { CreationEntrepriseSlug };
export { CREATION_ENTREPRISE_DOCS, CREATION_ENTREPRISE_SLUGS };

/** URL publique du hub. */
export const JURIDIQUE_HUB_PATH = "/juridique";

/** slug URL (tirets) → slug DB (underscores). */
export function creationEntreprisePathSlug(dbSlug: CreationEntrepriseSlug): string {
  return dbSlug.replace(/_/g, "-");
}

export function creationEntrepriseDbSlug(
  pathSlug: string | undefined,
): CreationEntrepriseSlug | null {
  if (!pathSlug?.trim()) return null;
  const asDb = pathSlug.trim().toLowerCase().replace(/-/g, "_") as CreationEntrepriseSlug;
  return CREATION_ENTREPRISE_SLUGS.includes(asDb) ? asDb : null;
}

export function juridiqueDocPath(dbSlug: CreationEntrepriseSlug): string {
  return `${JURIDIQUE_HUB_PATH}/${creationEntreprisePathSlug(dbSlug)}`;
}

export function isCreationEntrepriseLegalSlug(slug: string): slug is LegalPageSlug {
  return (CREATION_ENTREPRISE_SLUGS as readonly string[]).includes(slug);
}
