import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { dispatchAiUsageRefresh } from "@/lib/aiUsageRefresh";
import i18n from "@/i18n/config";

export type MediationStyleRequest = {
  id: string;
  label?: string;
  max_tokens: number;
  /** Règles persona depuis `prompt_style.style_rules`. */
  style_rules?: string;
  /** Consigne persona depuis `prompt_style.system_instruction`. */
  system_instruction?: string;
};

export type GenerateMediationParams = {
  sourceText: string;
  styles: MediationStyleRequest[];
  /** Langue cible des textes générés. Si omis, utilise la langue active de l'interface. */
  lang?: string;
};

export type AiJobType = "generate_fiche" | "translate_fiche";

/** Ligne `ai_jobs` renvoyée par la Edge Function `ai-create-job`. */
export type AiJobRow = {
  id: string;
  job_type: AiJobType;
  payload: Record<string, unknown>;
  model: string;
  status: string;
  attempts: number;
  next_run_at: string | null;
  result: unknown;
  error: unknown;
  created_at?: string;
  updated_at?: string;
};

export type AiCreateJobResponse = {
  job: AiJobRow;
};

export type CreateMediationJobParams = {
  sourceText: string;
  styles: MediationStyleRequest[];
  /** Langue cible (ex. `fr`) — stockée dans `payload.langue` pour le worker. */
  lang: string;
  /** ID œuvre / fiche ; sinon UUID généré côté client. */
  ficheId?: string;
  model?: string;
};

/** Réponse de la Edge Function generate-mediation (Gemini + JSON structuré). */
export type GenerateMediationResponse = {
  /** Textes par identifiant de style (même clés que demandées). */
  stylesById: Record<string, string>;
  /** Analyse / raisonnement préalable renvoyé par le modèle (hors champs visiteur). */
  analyseGlobale: string;
};

function toReadableErrorMessage(raw: unknown, fallback = "Impossible d'appeler generate-mediation."): string {
  if (!raw) return fallback;
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; details?: unknown };
    const err = typeof parsed.error === "string" ? parsed.error.trim() : "";
    const details = typeof parsed.details === "string" ? parsed.details.trim() : "";
    return [err, details].filter(Boolean).join(" ");
  } catch {
    return trimmed.replace(/\\"/g, '"');
  }
}

function messageFromFunctionBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { error?: unknown; details?: unknown; message?: unknown };
  const err = typeof b.error === "string" ? b.error.trim() : "";
  const details = typeof b.details === "string" ? b.details.trim() : "";
  if (err && details) return `${err} ${details}`;
  if (err) return err;
  if (typeof b.message === "string" && b.message.trim()) return b.message.trim();
  if (details) return details;
  return null;
}

async function readInvokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const ctx = error.context as unknown;
    if (ctx && typeof (ctx as Response).text === "function") {
      const text = await (ctx as Response).text().catch(() => "");
      if (text) {
        try {
          const json = JSON.parse(text) as unknown;
          const direct = messageFromFunctionBody(json);
          if (direct) return direct;
        } catch {
          const direct = toReadableErrorMessage(text);
          if (direct) return direct;
        }
      }
    }
  }

  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).text === "function") {
      const text = await (ctx as Response).text().catch(() => "");
      if (text) {
        try {
          const json = JSON.parse(text) as unknown;
          const direct = messageFromFunctionBody(json);
          if (direct) return direct;
        } catch {
          const direct = toReadableErrorMessage(text);
          if (direct) return direct;
        }
      }
    }
  }

  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return "Impossible d'appeler la fonction Edge.";
}

function normalizeMediationPayload(data: Record<string, unknown>): GenerateMediationResponse {
  const analyseRaw = data.analyse_globale;
  const analyseGlobale =
    typeof analyseRaw === "string" ? analyseRaw.trim() : typeof analyseRaw === "number" ? String(analyseRaw) : "";

  const stylesRaw = data.styles;
  const stylesById: Record<string, string> = {};
  if (stylesRaw && typeof stylesRaw === "object" && !Array.isArray(stylesRaw)) {
    for (const [k, v] of Object.entries(stylesRaw as Record<string, unknown>)) {
      if (!k.trim()) continue;
      stylesById[k] = typeof v === "string" ? v : "";
    }
  }

  return { stylesById, analyseGlobale };
}

export async function generateMediation(params: GenerateMediationParams): Promise<GenerateMediationResponse> {
  const payload = {
    source_text: params.sourceText,
    styles: params.styles,
    lang: params.lang ?? i18n.language ?? "fr",
  };

  const { data, error } = await supabase.functions.invoke("generate-mediation", {
    body: payload,
  });

  if (error) {
    const msg = await readInvokeErrorMessage(error);
    const readable = toReadableErrorMessage(msg);
    throw new Error(readable);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Réponse invalide de generate-mediation.");
  }

  dispatchAiUsageRefresh();

  return normalizeMediationPayload(data as Record<string, unknown>);
}

/**
 * Enfile un job `generate_fiche` via la Edge Function `ai-create-job`.
 * Le worker `ai-worker` consomme ensuite `payload.langue` et `payload.contenuSource`.
 */
export async function createMediationJob(
  params: CreateMediationJobParams,
): Promise<AiCreateJobResponse> {
  const { sourceText, styles, lang, ficheId, model } = params;

  const payload = {
    ficheId: ficheId ?? crypto.randomUUID(),
    langue: lang,
    contenuSource: sourceText,
    styles,
  };

  const { data, error } = await supabase.functions.invoke<AiCreateJobResponse>("ai-create-job", {
    body: {
      job_type: "generate_fiche" as const,
      payload,
      ...(model ? { model } : {}),
    },
  });

  if (error) {
    const msg = await readInvokeErrorMessage(error);
    console.error("Error creating mediation job", error, data);
    const detail =
      data && typeof data === "object" && "details" in data && typeof (data as { details?: unknown }).details === "string"
        ? String((data as { details: string }).details)
        : "";
    const hint =
      detail.includes("row-level security") || detail.includes("permission denied")
        ? " Vérifiez que migration_30_ai_jobs_rls.sql est appliquée et que les Edge Functions sont redéployées (service_role)."
        : detail.includes("does not exist") || detail.includes("relation")
          ? " Exécutez supabase/sql/ai_jobs_table.sql dans le SQL Editor Supabase."
          : "";
    throw new Error(toReadableErrorMessage(msg, "Impossible d'appeler ai-create-job.") + (detail ? ` — ${detail}` : "") + hint);
  }

  if (!data?.job?.id) {
    throw new Error("Réponse invalide de ai-create-job.");
  }

  return data;
}
