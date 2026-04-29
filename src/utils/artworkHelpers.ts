import { supabase } from "@/lib/supabase";

const FRENCH_ARTICLES = [
  "de la",
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "du",
  "de",
  "d",
  "l",
];

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeArticles(value: string): string {
  if (!value) return "";
  const raw = normalizeText(value);

  // Retire explicitement "de la" avant split token.
  const withoutComposite = raw.replace(/\bde la\b/g, " ");
  const tokens = withoutComposite.split(" ").filter(Boolean);

  return tokens.filter((token) => !FRENCH_ARTICLES.includes(token)).join("");
}

export function generateArtworkFingerprint(
  artist: { firstname?: string | null; lastname?: string | null; nickname?: string | null },
  title: string,
): string {
  const artistRaw = [artist.firstname, artist.lastname, artist.nickname].filter(Boolean).join(" ");
  const artistPart = removeArticles(artistRaw);
  const titlePart = removeArticles(title);
  return [artistPart, titlePart].filter(Boolean).join("_");
}

export async function checkArtworkExists(fingerprint: string): Promise<{
  exists: boolean;
  artworkId: string | null;
  error: string | null;
}> {
  const normalized = fingerprint.trim();
  if (!normalized) {
    return { exists: false, artworkId: null, error: "Fingerprint vide." };
  }

  const { data, error } = await supabase
    .from("artworks")
    .select("artwork_id")
    .eq("artwork_fingerprint", normalized)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { exists: false, artworkId: null, error: error.message };
  }

  return {
    exists: Boolean(data?.artwork_id),
    artworkId: (data?.artwork_id as string | undefined) ?? null,
    error: null,
  };
}

