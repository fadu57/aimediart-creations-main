// Nouveau : POST explicite vers ai-worker, body job_id, logs d’erreur.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type InvokeWorkerResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string; status?: number };

async function readWorkerError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const ctx = error.context as unknown;
    if (ctx && typeof (ctx as Response).text === "function") {
      const text = await (ctx as Response).text().catch(() => "");
      if (text) {
        try {
          const json = JSON.parse(text) as { error?: string; details?: string; message?: string };
          return [json.error, json.details, json.message].filter(Boolean).join(" — ");
        } catch {
          return text;
        }
      }
    }
  }
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return "Échec de l’appel à ai-worker.";
}

/**
 * Déclenche l’Edge Function `ai-worker` (POST).
 * @param jobId — si fourni, le worker traite ce job en priorité (recommandé).
 */
export async function invokeAiWorker(jobId?: string): Promise<InvokeWorkerResult> {
  const body = jobId ? { job_id: jobId } : {};

  const { data, error } = await supabase.functions.invoke("ai-worker", {
    method: "POST",
    body,
  });

  if (error) {
    const message = await readWorkerError(error);
    console.error("[invokeAiWorker] HTTP/function error", { jobId, message, error, data });
    return { ok: false, message };
  }

  console.info("[invokeAiWorker] OK", { jobId, data });
  return { ok: true, data };
}
