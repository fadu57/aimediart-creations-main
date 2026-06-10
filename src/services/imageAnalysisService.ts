import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import { dispatchAiUsageRefresh } from "@/lib/aiUsageRefresh";
import { supabase } from "@/lib/supabase";

export type AnalyzeArtworkImageParams = {
  imageUrl?: string;
  inlineImage?: { mimeType: string; base64Data: string };
  artistName?: string;
  artworkName?: string;
  /** Langue UI (fr, en, de, es, it) pour la fiche source générée. */
  outputLang?: string;
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
  /** Langue effectivement demandée au modèle. */
  output_lang?: string;
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
    output_lang: typeof o.output_lang === "string" ? o.output_lang : undefined,
    truncated: o.truncated === true,
    finish_reason: typeof o.finish_reason === "string" ? o.finish_reason : null,
    model_used: typeof o.model_used === "string" ? o.model_used : undefined,
    max_output_tokens:
      typeof maxOut === "number" && Number.isFinite(maxOut) ? Math.round(maxOut) : undefined,
  };
}

export async function analyzeArtworkImage(params: AnalyzeArtworkImageParams): Promise<AnalyzeArtworkImageResponse> {
  const payload = {
    image_url: params.imageUrl ?? null,
    image_base64: params.inlineImage?.base64Data ?? null,
    image_mime_type: params.inlineImage?.mimeType ?? null,
    artist_name: params.artistName ?? "",
    artwork_name: params.artworkName ?? "",
    output_lang: params.outputLang ?? "fr",
  };

  const { data, error } = await supabase.functions.invoke("analyze-artwork-image", {
    body: payload,
  });

  if (error) {
    if (error instanceof FunctionsFetchError) {
      throw new Error(
        "Connexion impossible à analyze-artwork-image (réseau ou fonction indisponible). Vérifiez le déploiement Supabase.",
      );
    }
    if (error instanceof FunctionsHttpError) {
      const ctx = error.context as Response | undefined;
      const text = ctx ? await ctx.text().catch(() => "") : "";
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string; message?: string; details?: string };
          const msg = [parsed.error, parsed.details, parsed.message].filter(Boolean).join(" — ");
          if (msg) throw new Error(msg);
        } catch (e) {
          if (e instanceof Error && e.message && !e.message.startsWith("Unexpected")) throw e;
          throw new Error(text.slice(0, 500));
        }
      }
    }
    throw new Error(error.message || "Erreur analyze-artwork-image.");
  }

  if (import.meta.env.DEV) {
    console.log("Données reçues par le Front-End (analyze-artwork-image) :", data);
  }

  const normalized = normalizeAnalyzeArtworkImageResponse(data);
  dispatchAiUsageRefresh();
  return normalized;
}
