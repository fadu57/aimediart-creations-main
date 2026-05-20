import { dispatchAiUsageRefresh } from "@/lib/aiUsageRefresh";

export type AnalyzeArtworkImageParams = {
  imageUrl?: string;
  inlineImage?: { mimeType: string; base64Data: string };
  artistName?: string;
  artworkName?: string;
};

/** Optionnel — l’analyse image renvoie désormais du texte brut dans `notes`. */
export type ImageAnalysisPersonaItem = {
  title: string;
  description: string;
  tone?: string;
};

export type AnalyzeArtworkImageResponse = {
  /** Texte brut / Markdown de l’analyse (matériau source). */
  notes: string;
  personas?: ImageAnalysisPersonaItem[];
  /** true si Gemini a atteint maxOutputTokens (finishReason MAX_TOKENS). */
  truncated?: boolean;
  finish_reason?: string | null;
  model_used?: string;
  max_output_tokens?: number;
};

function extractNotesString(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return "";

  const o = raw as Record<string, unknown>;
  if (typeof o.notes === "string") return o.notes.trim();
  if (typeof o.text === "string") return o.text.trim();
  if (typeof o.content === "string") return o.content.trim();

  const inner = o.data;
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const nested = extractNotesString(inner);
    if (nested) return nested;
  }

  return "";
}

export function normalizeAnalyzeArtworkImageResponse(raw: unknown): AnalyzeArtworkImageResponse {
  const notes = extractNotesString(raw);
  if (!notes) {
    throw new Error("Réponse invalide de analyze-artwork-image (texte vide).");
  }
  const o = raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const maxOut = o.max_output_tokens;
  return {
    notes,
    truncated: o.truncated === true,
    finish_reason: typeof o.finish_reason === "string" ? o.finish_reason : null,
    model_used: typeof o.model_used === "string" ? o.model_used : undefined,
    max_output_tokens:
      typeof maxOut === "number" && Number.isFinite(maxOut) ? Math.round(maxOut) : undefined,
  };
}

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
    artwork_name: params.artworkName ?? "",
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

  const data: unknown = await resp.json();
  if (import.meta.env.DEV) {
    console.log("Données reçues par le Front-End (analyze-artwork-image) :", data);
  }

  const normalized = normalizeAnalyzeArtworkImageResponse(data);
  dispatchAiUsageRefresh();
  return normalized;
}
