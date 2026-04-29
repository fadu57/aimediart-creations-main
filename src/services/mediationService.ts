import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type MediationStyleRequest = {
  id: string;
  label?: string;
  max_tokens: number;
};

export type GenerateMediationParams = {
  sourceText: string;
  styles: MediationStyleRequest[];
};

export type GenerateMediationResponse = Record<string, string>;

function toReadableErrorMessage(raw: unknown): string {
  if (!raw) return "Impossible d'appeler generate-mediation.";
  if (typeof raw !== "string") return "Impossible d'appeler generate-mediation.";
  const trimmed = raw.trim();
  if (!trimmed) return "Impossible d'appeler generate-mediation.";
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
  return "Impossible d'appeler generate-mediation.";
}

export async function generateMediation(params: GenerateMediationParams): Promise<GenerateMediationResponse> {
  const payload = {
    source_text: params.sourceText,
    styles: params.styles,
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

  const cleaned: GenerateMediationResponse = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (!key.trim()) continue;
    cleaned[key] = typeof value === "string" ? value : "";
  }
  return cleaned;
}

