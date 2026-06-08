import { supabase } from "@/lib/supabase";

export const ARTIST_BIO_LANGUAGES = ["fr", "en", "es", "de", "it"] as const;

export type Language = (typeof ARTIST_BIO_LANGUAGES)[number];

export const EMPTY_BIOS: Record<Language, string> = {
  fr: "",
  en: "",
  es: "",
  de: "",
  it: "",
};

function isLanguage(code: string): code is Language {
  return ARTIST_BIO_LANGUAGES.includes(code as Language);
}

function normalizeLang(raw: string | null | undefined): Language | null {
  const code = (raw ?? "").trim().toLowerCase().slice(0, 2);
  return isLanguage(code) ? code : null;
}

/** Au moins une langue a du texte. */
export function hasAnyBioText(b: Record<Language, string>): boolean {
  return ARTIST_BIO_LANGUAGES.some((l) => (b[l] ?? "").trim().length > 0);
}

/**
 * Charge les bios depuis `artist_bios` (une ligne par artist_id + language).
 * Ne lit jamais `artists.artist_bio`.
 */
export async function loadArtistBiosForForm(artistId: string): Promise<Record<Language, string>> {
  const { data, error } = await supabase
    .from("artist_bios")
    .select("language,bio_text")
    .eq("artist_id", artistId);

  if (error) {
    throw error;
  }

  const merged: Record<Language, string> = { ...EMPTY_BIOS };

  for (const row of (data ?? []) as Array<{ language?: string | null; bio_text?: string | null }>) {
    const lang = normalizeLang(row.language);
    if (!lang) continue;
    merged[lang] = (row.bio_text ?? "").trim();
  }

  return merged;
}

/**
 * Insert / update / delete d’une ligne de bio (clé : artist_id + language).
 * - si `bioText` est vide => suppression de la ligne
 * - sinon upsert via contrainte unique (artist_id, language)
 */
export async function upsertArtistBioRow(
  artistId: string,
  language: Language,
  bioText: string,
): Promise<void> {
  const text = bioText.trim();

  if (!text) {
    const { error: deleteError } = await supabase
      .from("artist_bios")
      .delete()
      .eq("artist_id", artistId)
      .eq("language", language);

    if (deleteError) {
      throw new Error(
        typeof deleteError.message === "string"
          ? deleteError.message
          : "Bio multilingue : suppression impossible.",
      );
    }
    return;
  }

  const { error: upsertError } = await supabase.from("artist_bios").upsert(
    {
      artist_id: artistId,
      language,
      bio_text: text,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "artist_id,language" },
  );

  if (upsertError) {
    throw new Error(
      typeof upsertError.message === "string"
        ? upsertError.message
        : "Bio multilingue : enregistrement impossible.",
    );
  }
}
