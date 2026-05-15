import { useEffect, useState } from "react";

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

/** Au moins une langue a du texte venant du serveur. */
export function hasAnyBioText(b: Record<Language, string>): boolean {
  return ARTIST_BIO_LANGUAGES.some((l) => (b[l] ?? "").trim().length > 0);
}

/**
 * Charge les biographies d’un artiste.
 * Priorité :
 * 1) bios liées à l’agence courante
 * 2) fallback sur les bios globales (agency_id IS NULL) pour les langues manquantes
 */
export function useArtistBios(artistId: string | null, agencyId: string | null) {
  const [bios, setBios] = useState<Record<Language, string>>({ ...EMPTY_BIOS });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!artistId) {
      setBios({ ...EMPTY_BIOS });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void (async () => {
      const merged: Record<Language, string> = { ...EMPTY_BIOS };
      const scopedAgency = agencyId?.trim() || null;

      try {
        if (scopedAgency) {
          const { data: agencyRows, error: agencyError } = await supabase
            .from("artist_bios")
            .select("language,bio_text")
            .eq("artist_id", artistId)
            .eq("agency_id", scopedAgency);

          if (agencyError) {
            throw agencyError;
          }

          for (const row of (agencyRows ?? []) as Array<{ language?: string | null; bio_text?: string | null }>) {
            const lang = normalizeLang(row.language);
            if (!lang) continue;
            merged[lang] = (row.bio_text ?? "").trim();
          }
        }

        const missingLanguages = ARTIST_BIO_LANGUAGES.filter((lang) => !merged[lang].trim());

        if (missingLanguages.length > 0) {
          const { data: globalRows, error: globalError } = await supabase
            .from("artist_bios")
            .select("language,bio_text")
            .eq("artist_id", artistId)
            .is("agency_id", null);

          if (globalError) {
            throw globalError;
          }

          for (const row of (globalRows ?? []) as Array<{ language?: string | null; bio_text?: string | null }>) {
            const lang = normalizeLang(row.language);
            if (!lang) continue;
            if (merged[lang].trim()) continue;
            merged[lang] = (row.bio_text ?? "").trim();
          }
        }

        if (cancelled) return;
        setBios(merged);
      } catch (error) {
        if (cancelled) return;
        console.warn(
          "[useArtistBios]",
          error instanceof Error ? error.message : "Chargement impossible.",
        );
        setBios({ ...EMPTY_BIOS });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [artistId, agencyId]);

  return { bios, loading };
}

/**
 * Insert / update / delete d’une ligne de bio.
 * - si `bioText` est vide => suppression de la ligne
 * - sinon update si ligne existante, insert sinon
 */
export async function upsertArtistBioRow(
  artistId: string,
  agencyId: string | null,
  language: Language,
  bioText: string,
): Promise<void> {
  const text = bioText.trim();
  const scopedAgency = agencyId?.trim() || null;

  let query = supabase
    .from("artist_bios")
    .select("id")
    .eq("artist_id", artistId)
    .eq("language", language)
    .limit(2);

  if (scopedAgency) {
    query = query.eq("agency_id", scopedAgency);
  } else {
    query = query.is("agency_id", null);
  }

  const { data: existingRows, error: selectError } = await query;
  if (selectError) {
    throw new Error(
      typeof selectError.message === "string"
        ? selectError.message
        : "Bio multilingue : lecture impossible.",
    );
  }

  const rows = (existingRows ?? []) as Array<{ id?: string | null }>;

  if (rows.length > 1) {
    throw new Error(
      `Bio multilingue : plusieurs lignes existent déjà pour ${language.toUpperCase()} (${scopedAgency ? "agence" : "globale"}).`
    );
  }

  const existingId = rows[0]?.id?.trim() || null;

  if (!text) {
    if (!existingId) return;

    const { error: deleteError } = await supabase.from("artist_bios").delete().eq("id", existingId);
    if (deleteError) {
      throw new Error(
        typeof deleteError.message === "string"
          ? deleteError.message
          : "Bio multilingue : suppression impossible.",
      );
    }
    return;
  }

  if (existingId) {
    const { error: updateError } = await supabase
      .from("artist_bios")
      .update({ bio_text: text, updated_at: new Date().toISOString() })
      .eq("id", existingId);

    if (updateError) {
      throw new Error(
        typeof updateError.message === "string"
          ? updateError.message
          : "Bio multilingue : mise à jour impossible.",
      );
    }
    return;
  }

  const { error: insertError } = await supabase.from("artist_bios").insert({
    artist_id: artistId,
    agency_id: scopedAgency,
    language,
    bio_text: text,
  });

  if (insertError) {
    throw new Error(
      typeof insertError.message === "string"
        ? insertError.message
        : "Bio multilingue : insertion impossible.",
    );
  }
}