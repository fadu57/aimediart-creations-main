import type { PromptStyleLabelFields } from "@/lib/promptStyleLabel";
import { inferJsonKeyFromDisplayName } from "@/lib/inferPromptStyleKey";
/**
 * Codes / libellés FR : source unique `mediationStyleCodes.ts` (réexportés ci‑dessous).
 */
import {
  CANONICAL_MEDIATION_STYLE_SET,
  type MediationVisitorStyleCode,
} from "@/lib/mediationStyleCodes";
import { mediationTextForStyleCodeAndLang, normalizeMediationStyleKeyForLookup } from "@/lib/artworkDescriptionI18n";

export {
  FR_MEDIATION_STYLE_LABELS,
  MEDIATION_VISITOR_STYLE_CODES,
  type MediationVisitorStyleCode,
} from "@/lib/mediationStyleCodes";

const CANONICAL_SET = CANONICAL_MEDIATION_STYLE_SET;

/**
 * Normalise `prompt_style.code` (ou équivalent) vers un des codes médiation connus.
 * Ne devine rien à partir du libellé : évite tout mélange entre styles.
 */
export function canonicalMediationStyleCode(raw: string | null | undefined): MediationVisitorStyleCode | null {
  if (raw == null) return null;
  const n = normalizeMediationStyleKeyForLookup(raw);
  if (!n) return null;
  if (CANONICAL_SET.has(n)) return n as MediationVisitorStyleCode;
  return null;
}

export type PromptStyleRowLike = PromptStyleLabelFields & { id?: string | number; icon?: string | null };

/** Associe une ligne `prompt_style` au slot canonique (`code` DB ou libellé reconnu). */
export function rowCanonicalMediationStyle(row: PromptStyleRowLike): MediationVisitorStyleCode | null {
  const fromCode = canonicalMediationStyleCode(row.code ?? null);
  if (fromCode) return fromCode;

  const label =
    [row.name_fr, row.name, row.name_en, row.name_de, row.name_es, row.name_it].find(
      (v) => typeof v === "string" && v.trim(),
    ) ?? "";
  const inferred = inferJsonKeyFromDisplayName(typeof label === "string" ? label : "");
  if (inferred && CANONICAL_SET.has(inferred)) return inferred as MediationVisitorStyleCode;

  return null;
}

/**
 * Indexe les lignes `prompt_style` par code canonique (première occurrence conservée).
 */
export function indexPromptStylesByMediationCode(
  rows: PromptStyleRowLike[],
): Map<MediationVisitorStyleCode, PromptStyleRowLike> {
  const map = new Map<MediationVisitorStyleCode, PromptStyleRowLike>();
  for (const row of rows) {
    const c = rowCanonicalMediationStyle(row);
    if (c && !map.has(c)) map.set(c, row);
  }
  return map;
}

/**
 * Texte médiation pour la slide : uniquement la clé canonique (`jsonLookupKey`), langue UI puis repli `fr`.
 */
export function resolveVisitorMediationText(
  artworkDescriptionI18n: unknown,
  primaryJsonKey: string,
  viewerLanguageTag: string,
  _row: PromptStyleRowLike | undefined,
): string {
  const primary = primaryJsonKey.trim();
  if (!primary) return "";
  return mediationTextForStyleCodeAndLang(artworkDescriptionI18n, primary, viewerLanguageTag).trim();
}
