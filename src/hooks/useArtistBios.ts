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

/** Au moins une langue a du texte venant du serveur. */
export function hasAnyBioText(b: Record<Language, string>): boolean {
  return ARTIST_BIO_LANGUAGES.some((l) => (b[l] ?? "").trim().length > 0);
}

/** Charge les lignes `artist_bios` pour l’artiste (priorité aux lignes dont `agency_id` = `agencyId`). */
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
      const { data, error } = await supabase
        .from("artist_bios")
        .select("language,bio_text,agency_id")
        .eq("artist_id", artistId);

      if (cancelled) return;
      setLoading(false);

      if (error) {
        console.warn("[useArtistBios]", error.message);
        setBios({ ...EMPTY_BIOS });
        return;
      }

      const rows = (data ??
        []) as Array<{ language?: string | null; bio_text?: string | null; agency_id?: string | null }>;

      const prioritized = [...rows].sort((a, b) => {
        const am = agencyId ? ((a.agency_id ?? "").trim() === agencyId ? 1 : 0) : 0;
        const bm = agencyId ? ((b.agency_id ?? "").trim() === agencyId ? 1 : 0) : 0;
        return bm - am;
      });

      const merged: Record<Language, string> = { ...EMPTY_BIOS };
      const seen = new Set<Language>();

      for (const r of prioritized) {
        const raw = (r.language ?? "").trim().toLowerCase().slice(0, 2);
        if (!isLanguage(raw) || seen.has(raw)) continue;
        seen.add(raw);
        merged[raw] = (r.bio_text ?? "").trim();
      }

      setBios(merged);
    })();

    return () => {
      cancelled = true;
    };
  }, [artistId, agencyId]);

  return { bios, loading };
}

/** Insert / mise à jour d’une ligne bio (adapter `onConflict` au schéma réel si besoin). */
export async function upsertArtistBioRow(
  artistId: string,
  agencyId: string,
  lang: Language,
  bioText: string,
): Promise<void> {
  const row = {
    artist_id: artistId,
    agency_id: agencyId,
    language: lang,
    bio_text: bioText.trim(),
  };

  const { error } = await supabase.from("artist_bios").upsert(row, {
    onConflict: "artist_id,agency_id,language",
  });

  if (error) {
    throw new Error(typeof error.message === "string" ? error.message : "Bio multilingue : erreur Upsert.");
  }
}
