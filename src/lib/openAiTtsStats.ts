/**
 * Statistiques mensuelles OpenAI TTS + réconciliation (ai_usage_events / audio_files).
 */

import { supabase } from "@/lib/supabase";
import {
  GPT4O_MINI_TTS_COST_MODEL,
  recalculateOpenAiTtsEventCostUsd,
  voiceCellKeyFromMetadata,
} from "@/lib/openAiTtsCost";

export type OpenAiTtsRegenerationRow = {
  cellKey: string;
  textId: string;
  lang: string;
  textType: string;
  gender: string;
  callCount: number;
  extraCalls: number;
  costLoggedUsd: number;
  costRecalculatedUsd: number;
  lastDates: string[];
};

export type OpenAiTtsMonthStats = {
  /** Somme des cost_estimated en base (peut inclure ancien barème tts-1). */
  costLoggedUsd: number;
  /** Recalcul gpt-4o-mini-tts (texte + consignes + audio). */
  costRecalculatedUsd: number;
  /** Alias rétrocompat — coût recalculé affiché par défaut. */
  costUsd: number;
  apiCallCount: number;
  uniqueVoiceCells: number;
  regenerationExtraCalls: number;
  regenerationExtraCostLoggedUsd: number;
  regenerationExtraCostRecalculatedUsd: number;
  audioFileCount: number;
  unloggedReadyFiles: number;
  avgCostUsd: number;
  byGender: { F: number; M: number };
  byTextType: { bio: number; mediation: number };
  regenerations: OpenAiTtsRegenerationRow[];
  eventsWithLegacyPricing: number;
};

export function currentCalendarMonthStartLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01T00:00:00.000`;
}

const EMPTY_STATS: OpenAiTtsMonthStats = {
  costLoggedUsd: 0,
  costRecalculatedUsd: 0,
  costUsd: 0,
  apiCallCount: 0,
  uniqueVoiceCells: 0,
  regenerationExtraCalls: 0,
  regenerationExtraCostLoggedUsd: 0,
  regenerationExtraCostRecalculatedUsd: 0,
  audioFileCount: 0,
  unloggedReadyFiles: 0,
  avgCostUsd: 0,
  byGender: { F: 0, M: 0 },
  byTextType: { bio: 0, mediation: 0 },
  regenerations: [],
  eventsWithLegacyPricing: 0,
};

type UsageEventRow = {
  id: string;
  created_at: string;
  cost_estimated?: number | null;
  input_units?: number | null;
  operation_name?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function fetchOpenAiTtsMonthStats(
  monthStart = currentCalendarMonthStartLocal(),
): Promise<OpenAiTtsMonthStats> {
  const [eventsRes, filesRes] = await Promise.all([
    supabase
      .from("ai_usage_events")
      .select("id,created_at,cost_estimated,input_units,operation_name,metadata")
      .eq("provider", "openai")
      .eq("tool_type", "tts")
      .gte("created_at", monthStart)
      .order("created_at", { ascending: false }),
    supabase
      .from("audio_files")
      .select("gender,text_type,text_id,lang,prompt_style_id,status,provider")
      .eq("provider", "openai")
      .gte("created_at", monthStart),
  ]);

  if (eventsRes.error && filesRes.error) return EMPTY_STATS;

  const events = (eventsRes.data ?? []) as UsageEventRow[];
  const fileRows = filesRes.data ?? [];

  let costLoggedUsd = 0;
  let costRecalculatedUsd = 0;
  let eventsWithLegacyPricing = 0;

  const byCell = new Map<string, UsageEventRow[]>();
  for (const e of events) {
    costLoggedUsd += Number(e.cost_estimated) || 0;
    costRecalculatedUsd += recalculateOpenAiTtsEventCostUsd(e);
    if ((e.metadata?.cost_model as string | undefined) !== GPT4O_MINI_TTS_COST_MODEL) {
      eventsWithLegacyPricing += 1;
    }
    const key = voiceCellKeyFromMetadata(e.metadata);
    if (!byCell.has(key)) byCell.set(key, []);
    byCell.get(key)!.push(e);
  }

  const eventCellKeys = new Set(
    events.map((e) => voiceCellKeyFromMetadata(e.metadata)).filter((k) => k !== "|||"),
  );

  const readyFiles = fileRows.filter((f) => f.status === "ready");
  let unloggedReadyFiles = 0;
  for (const f of readyFiles) {
    const key = `${f.text_id}|${f.lang}|${f.prompt_style_id}|${f.gender}`;
    if (!eventCellKeys.has(key)) unloggedReadyFiles += 1;
  }

  const byGender = { F: 0, M: 0 };
  const byTextType = { bio: 0, mediation: 0 };
  for (const row of readyFiles) {
    const g = (row.gender ?? "").trim().toUpperCase();
    if (g === "F" || g === "M") byGender[g] += 1;
    const tt = (row.text_type ?? "").trim().toLowerCase();
    if (tt === "bio") byTextType.bio += 1;
    else if (tt === "mediation") byTextType.mediation += 1;
  }

  const regenerations: OpenAiTtsRegenerationRow[] = [];
  let regenerationExtraCalls = 0;
  let regenerationExtraCostLoggedUsd = 0;
  let regenerationExtraCostRecalculatedUsd = 0;

  for (const [cellKey, list] of byCell) {
    if (list.length <= 1 || cellKey === "|||") continue;
    const extra = list.slice(1);
    const costLogged = extra.reduce((s, e) => s + (Number(e.cost_estimated) || 0), 0);
    const costRecalc = extra.reduce((s, e) => s + recalculateOpenAiTtsEventCostUsd(e), 0);
    regenerationExtraCalls += extra.length;
    regenerationExtraCostLoggedUsd += costLogged;
    regenerationExtraCostRecalculatedUsd += costRecalc;

    const meta = list[0]?.metadata ?? {};
    regenerations.push({
      cellKey,
      textId: String(meta.text_id ?? ""),
      lang: String(meta.lang ?? ""),
      textType: String(list[0]?.operation_name ?? meta.text_type ?? ""),
      gender: String(meta.gender ?? ""),
      callCount: list.length,
      extraCalls: extra.length,
      costLoggedUsd: costLogged,
      costRecalculatedUsd: costRecalc,
      lastDates: list.slice(0, 3).map((e) => String(e.created_at ?? "").slice(0, 10)),
    });
  }

  regenerations.sort((a, b) => b.extraCalls - a.extraCalls);

  const audioFileCount = readyFiles.length;
  const costUsd = costRecalculatedUsd;

  return {
    costLoggedUsd,
    costRecalculatedUsd,
    costUsd,
    apiCallCount: events.length,
    uniqueVoiceCells: byCell.size,
    regenerationExtraCalls,
    regenerationExtraCostLoggedUsd,
    regenerationExtraCostRecalculatedUsd,
    audioFileCount,
    unloggedReadyFiles,
    avgCostUsd: events.length > 0 ? costRecalculatedUsd / events.length : 0,
    byGender,
    byTextType,
    regenerations: regenerations.slice(0, 15),
    eventsWithLegacyPricing,
  };
}
