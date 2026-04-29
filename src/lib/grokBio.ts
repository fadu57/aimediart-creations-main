/**
 * Génère une courte biographie via l'Edge Function `generate-artist-bio`.
 * La fonction lit le prompt dynamique dans `app_settings` côté serveur.
 */
export async function generateBiographyWithGrok(params: {
  prenom: string;
  name: string;
  artTypes: string[];
}): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Configuration Supabase manquante (URL ou ANON KEY).");
  }

  const endpoint = `${supabaseUrl}/functions/v1/generate-artist-bio`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      prenom: params.prenom,
      nom: params.name,
      art_types: params.artTypes,
    }),
  });

  const raw = await response.text();
  let parsed: { bio?: string; error?: string; details?: string } | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as { bio?: string; error?: string; details?: string }) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = [parsed?.error, parsed?.details, raw].filter(Boolean).join(" - ");
    throw new Error(detail || `Erreur Edge Function (${response.status}).`);
  }

  const bio = parsed?.bio?.trim() ?? "";
  if (!bio) {
    throw new Error("Réponse vide de la fonction generate-artist-bio.");
  }
  return bio;
}
