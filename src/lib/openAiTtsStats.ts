/**
 * Statistiques mensuelles OpenAI TTS (ai_usage_events + audio_files).
 */

import { supabase } from "@/lib/supabase";

export type OpenAiTtsMonthStats = {
  costUsd: number;
  mp3Count: number;
  avgCostUsd: number;
  byGender: { F: number; M: number };
  byTextType: { bio: number; mediation: number };
};

export function currentCalendarMonthStartLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01T00:00:00.000`;
}

const EMPTY_STATS: OpenAiTtsMonthStats = {
  costUsd: 0,
  mp3Count: 0,
  avgCostUsd: 0,
  byGender: { F: 0, M: 0 },
  byTextType: { bio: 0, mediation: 0 },
};

export async function fetchOpenAiTtsMonthStats(
  monthStart = currentCalendarMonthStartLocal(),
): Promise<OpenAiTtsMonthStats> {
  const [eventsRes, filesRes] = await Promise.all([
    supabase
      .from("ai_usage_events")
      .select("cost_estimated")
      .eq("provider", "openai")
      .eq("tool_type", "tts")
      .gte("created_at", monthStart),
    supabase
      .from("audio_files")
      .select("gender, text_type")
      .eq("status", "ready")
      .gte("created_at", monthStart),
  ]);

  if (eventsRes.error && filesRes.error) return EMPTY_STATS;

  const eventRows = (eventsRes.data ?? []) as Array<{ cost_estimated?: number | null }>;
  const costUsd = eventRows.reduce((sum, r) => sum + (Number(r.cost_estimated) || 0), 0);

  const fileRows = (filesRes.data ?? []) as Array<{
    gender?: string | null;
    text_type?: string | null;
  }>;

  const byGender = { F: 0, M: 0 };
  const byTextType = { bio: 0, mediation: 0 };

  for (const row of fileRows) {
    const g = (row.gender ?? "").trim().toUpperCase();
    if (g === "F" || g === "M") byGender[g] += 1;
    const tt = (row.text_type ?? "").trim().toLowerCase();
    if (tt === "bio") byTextType.bio += 1;
    else if (tt === "mediation") byTextType.mediation += 1;
  }

  const mp3Count = fileRows.length;

  return {
    costUsd,
    mp3Count,
    avgCostUsd: mp3Count > 0 ? costUsd / mp3Count : 0,
    byGender,
    byTextType,
  };
}
