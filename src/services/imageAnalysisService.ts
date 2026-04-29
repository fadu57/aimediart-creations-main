import { supabase } from "@/lib/supabase";

export type AnalyzeArtworkImageParams = {
  imageUrl?: string;
  inlineImage?: { mimeType: string; base64Data: string };
  artistName?: string;
};

export type AnalyzeArtworkImageResponse = {
  notes: string;
};

export async function analyzeArtworkImage(params: AnalyzeArtworkImageParams): Promise<AnalyzeArtworkImageResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase env manquantes (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  }

  const payload = {
    image_url: params.imageUrl ?? null,
    image_base64: params.inlineImage?.base64Data ?? null,
    image_mime_type: params.inlineImage?.mimeType ?? null,
    artist_name: params.artistName ?? "",
  };

  const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/analyze-artwork-image`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(text || `Erreur analyze-artwork-image (${resp.status})`);
  }

  const data = (await resp.json()) as unknown;
  if (!data || typeof data !== "object" || !("notes" in data)) {
    throw new Error("Réponse invalide de analyze-artwork-image.");
  }
  return data as AnalyzeArtworkImageResponse;
}

