import { supabase } from "@/lib/supabase";

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_TIMEOUT_MS = 60_000;

export type AiJobPollRow = {
  status: string;
  result: { text?: string } | null;
  error?: { message?: string } | null;
};

export type PollAiJobSuccess = { ok: true; text: string };
export type PollAiJobFailure = { ok: false; message: string };

export type PollResult = PollAiJobSuccess | PollAiJobFailure;

type PollOptions = {
  intervalMs?: number;
  /** Durée max d’attente (défaut 60 s). */
  timeoutMs?: number;
  /** @deprecated Préférer `timeoutMs`. Conservé pour compatibilité. */
  maxAttempts?: number;
  /** Appelé à chaque cycle de poll (pour barre de progression UI). */
  onTick?: (info: { elapsedMs: number; timeoutMs: number; status: string }) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseUntyped = supabase as any;

/**
 * PostgREST renvoie 406 / PGRST116 quand `.single()` / `.maybeSingle()` ne reçoivent
 * pas exactement une ligne (0 ligne = RLS, job absent, ou plusieurs lignes).
 */
function isSingleRowCoerceError(error: {
  code?: string;
  message?: string;
  status?: number;
} | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.status === 406 ||
    error.code === "PGRST116" ||
    error.code === "PGRST204" ||
    msg.includes("cannot coerce the result to a single json object") ||
    msg.includes("json object requested, multiple (or no) rows returned")
  );
}

function jobNotFoundMessage(): string {
  return "Job introuvable, inaccessible (RLS) ou identifiant invalide.";
}

function extractErrorMessage(job: AiJobPollRow): string {
  if (job.error && typeof job.error.message === "string" && job.error.message.trim()) {
    return job.error.message.trim();
  }
  return "Le job IA a échoué.";
}

/**
 * Lit au plus une ligne `ai_jobs` sans `.single()` (évite le 406 PostgREST).
 */
async function fetchAiJobRow(
  jobId: string,
): Promise<
  | { kind: "ok"; row: AiJobPollRow }
  | { kind: "not_found" }
  | { kind: "ambiguous" }
  | { kind: "error"; message: string }
> {
  const { data, error } = await supabaseUntyped
    .from("ai_jobs")
    .select("status, result, error")
    .eq("id", jobId)
    .limit(2);

  if (error) {
    if (isSingleRowCoerceError(error)) {
      return { kind: "not_found" };
    }
    return {
      kind: "error",
      message: error.message || "Erreur lors de la lecture du job.",
    };
  }

  const rows = (Array.isArray(data) ? data : []) as AiJobPollRow[];

  if (rows.length === 0) {
    return { kind: "not_found" };
  }

  if (rows.length > 1) {
    return { kind: "ambiguous" };
  }

  return { kind: "ok", row: rows[0] };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Attend qu’un job `ai_jobs` passe à `done` ou `error` (poll toutes les 2 s par défaut).
 */
export async function pollAiJobUntilDone(
  jobId: string,
  options?: PollOptions,
): Promise<PollResult> {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs =
    options?.timeoutMs ??
    (options?.maxAttempts != null ? options.maxAttempts * intervalMs : DEFAULT_TIMEOUT_MS);

  const deadline = Date.now() + timeoutMs;
  const startedAt = Date.now();

  while (Date.now() < deadline) {
    const elapsedMs = Date.now() - startedAt;
    const fetchResult = await fetchAiJobRow(jobId);

    if (fetchResult.kind === "not_found" || fetchResult.kind === "ambiguous") {
      return {
        ok: false,
        message:
          fetchResult.kind === "ambiguous"
            ? "Plusieurs jobs correspondent à cet identifiant."
            : jobNotFoundMessage(),
      };
    }

    if (fetchResult.kind === "error") {
      return { ok: false, message: fetchResult.message };
    }

    const row = fetchResult.row;

    options?.onTick?.({
      elapsedMs,
      timeoutMs,
      status: row.status,
    });

    if (row.status === "done") {
      const text =
        row.result && typeof row.result.text === "string"
          ? row.result.text.trim()
          : "";
      return { ok: true, text };
    }

    if (row.status === "error") {
      return { ok: false, message: extractErrorMessage(row) };
    }

    // pending | running | retry_later → on attend le prochain tick
    await sleep(intervalMs);
  }

  return { ok: false, message: "Timeout en attendant le job IA." };
}

/** @deprecated Import depuis `@/lib/aiJobs/invokeAiWorker` */
export { invokeAiWorker } from "@/lib/aiJobs/invokeAiWorker";
