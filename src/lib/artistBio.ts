import type { User } from "@supabase/supabase-js";

/**
 * Langue BCP 47 pour l’attribut `lang` du champ biographie (correcteur du navigateur).
 * Priorité : métadonnées utilisateur Supabase, puis navigateur, puis français.
 */
export function resolveSpellcheckLang(user: User | null): string {
  const meta = user?.user_metadata as Record<string, unknown> | undefined;
  const raw =
    (typeof meta?.locale === "string" && meta.locale.trim()) ||
    (typeof meta?.language === "string" && meta.language.trim());
  if (raw) {
    const norm = raw.replace(/_/g, "-");
    if (/^[a-zA-Z]{2}([-_][a-zA-Z]{2})?$/.test(norm)) {
      return norm.length === 2 ? norm.toLowerCase() : norm;
    }
  }
  if (typeof navigator !== "undefined" && navigator.language?.trim()) {
    return navigator.language.trim();
  }
  return "fr";
}

/**
 * À l’enregistrement : supprime les lignes blanches entre paragraphes (sauts de ligne multiples → un seul).
 */
export function normalizeArtistBioForStorage(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
