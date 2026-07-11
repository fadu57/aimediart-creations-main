import { supabase } from "./supabase";
import { COST_INTEGRITY_HISTORICAL_CUTOFF_ISO } from "./costReliability";

export type CostIntegrityIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  count: number;
};

export type CostIntegrityReport = {
  ok: boolean;
  issues: CostIntegrityIssue[];
  checkedAt: string;
  historicalExcludedCount: number;
};

function logHasArtworkLink(row: {
  artwork_id?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (row.artwork_id?.trim()) return true;
  const metaId = row.metadata?.artwork_id;
  return typeof metaId === "string" && Boolean(metaId.trim());
}

function isMediationLog(row: {
  provider?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (row.metadata?.operation === "mediation") return true;
  if (row.metadata?.source_function === "generate-mediation") return true;
  return row.provider === "gemini" || row.provider === "groq";
}

/** Contrôles de cohérence — uniquement sur données >= seuil de fiabilité. */
export async function getCostIntegrityReport(): Promise<CostIntegrityReport> {
  const issues: CostIntegrityIssue[] = [];
  const checkedAt = new Date().toISOString();
  const cutoff = COST_INTEGRITY_HISTORICAL_CUTOFF_ISO;

  const { data: logs, error: logsErr } = await supabase
    .from("ai_usage_logs")
    .select("id, provider, artwork_id, metadata, prompt_tokens, completion_tokens, created_at")
    .gte("created_at", cutoff);

  if (logsErr) {
    return {
      ok: false,
      checkedAt,
      historicalExcludedCount: 0,
      issues: [{
        code: "logs_unreadable",
        severity: "error",
        message: "Impossible de lire ai_usage_logs.",
        count: 0,
      }],
    };
  }

  const rows = logs ?? [];

  // Historique avant seuil : non contrôlé (429 médiation + 42 TTS sans œuvre)
  let historicalUnlinked = 0;
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: hist } = await supabase
        .from("ai_usage_logs")
        .select("id, provider, artwork_id, metadata, created_at")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      const page = hist ?? [];
      for (const row of page) {
        if (!logHasArtworkLink(row)) historicalUnlinked += 1;
      }
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }

  const mediationLogs = rows.filter(isMediationLog);
  const mediationUnlinked = mediationLogs.filter((r) => !logHasArtworkLink(r));

  if (mediationUnlinked.length > 0) {
    issues.push({
      code: "mediation_logs_without_artwork",
      severity: "error",
      message:
        "Logs médiation (Gemini/Groq) sans rattachement œuvre — exclus des totaux filtrés expo/œuvre.",
      count: mediationUnlinked.length,
    });
  }

  const allUnlinked = rows.filter((r) => !logHasArtworkLink(r));
  if (allUnlinked.length > 0 && allUnlinked.length !== mediationUnlinked.length) {
    issues.push({
      code: "usage_logs_without_artwork",
      severity: "warning",
      message: "Autres logs IA sans artwork_id (hors médiation directe).",
      count: allUnlinked.length - mediationUnlinked.length,
    });
  }

  const { data: openaiEvents } = await supabase
    .from("ai_usage_events")
    .select("id, metadata, operation_name, created_at")
    .eq("provider", "openai")
    .gte("created_at", cutoff);

  const openaiMediationNoText = (openaiEvents ?? []).filter((e) => {
    const op = e.operation_name ?? "";
    if (op !== "mediation" && op !== "bio") return false;
    const meta = e.metadata ?? {};
    return !String(meta.text_id ?? meta.artwork_id ?? "").trim();
  });

  if (openaiMediationNoText.length > 0) {
    issues.push({
      code: "openai_events_without_text_id",
      severity: "error",
      message: "Événements OpenAI TTS sans text_id/artwork_id — non filtrables par expo.",
      count: openaiMediationNoText.length,
    });
  }

  const { data: geminiEvents } = await supabase
    .from("ai_usage_events")
    .select("id, metadata, operation_name, created_at")
    .eq("provider", "google_gemini")
    .eq("operation_name", "mediation")
    .gte("created_at", cutoff);

  const geminiNoArt = (geminiEvents ?? []).filter(
    (e) => !String(e.metadata?.artwork_id ?? e.metadata?.text_id ?? "").trim(),
  );
  if (geminiNoArt.length > 0) {
    issues.push({
      code: "gemini_mediation_events_without_artwork",
      severity: "warning",
      message: "Événements Gemini médiation sans lien œuvre.",
      count: geminiNoArt.length,
    });
  }

  const hasError = issues.some((i) => i.severity === "error");
  return {
    ok: !hasError,
    issues,
    checkedAt,
    historicalExcludedCount: historicalUnlinked,
  };
}
