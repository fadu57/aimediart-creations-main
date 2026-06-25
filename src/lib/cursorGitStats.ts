import { supabase } from "@/lib/supabase";

export type CursorGitCommit = {
  sha: string;
  short_sha: string;
  date: string;
  title: string;
  url: string;
  files_added: string[];
};

export type CursorGitDailyPoint = {
  date: string;
  commits: number;
  files_created: number;
};

export type CursorGitStats = {
  repo: string;
  branch: string;
  commit_count: number;
  files_created_count: number;
  unique_files_created: number;
  commits: CursorGitCommit[];
  daily: CursorGitDailyPoint[];
  range: { dateFrom: string; dateTo: string };
  fetched_at: string;
};

async function parseInvokeError(error: unknown): Promise<string> {
  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).text === "function") {
      const text = await (ctx as Response).text().catch(() => "");
      if (text) {
        try {
          const json = JSON.parse(text) as { error?: string; message?: string; details?: string };
          return [json.message, json.error, json.details].filter(Boolean).join(" — ");
        } catch {
          return text;
        }
      }
    }
  }
  if (error && typeof error === "object" && "message" in error) {
    const m = String((error as { message?: unknown }).message ?? "");
    if (/failed to send a request to the edge function/i.test(m)) {
      return "Fonction Edge cursor-git-stats indisponible — déployez-la avec : supabase functions deploy cursor-git-stats";
    }
    if (m.trim()) return m;
  }
  return "Erreur lors de l'appel GitHub.";
}

export async function fetchCursorGitStats(
  range: { dateFrom: string; dateTo: string },
): Promise<{ data: CursorGitStats | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("cursor-git-stats", {
    method: "POST",
    body: { dateFrom: range.dateFrom, dateTo: range.dateTo },
  });

  if (error) {
    return { data: null, error: await parseInvokeError(error) };
  }

  const payload = data as { error?: string; message?: string } | CursorGitStats | null;
  if (!payload || typeof payload !== "object") {
    return { data: null, error: "Réponse GitHub vide." };
  }
  if ("error" in payload && payload.error) {
    const msg = [payload.message, payload.error].filter(Boolean).join(" — ");
    return { data: null, error: msg || "Erreur GitHub." };
  }

  const stats = payload as CursorGitStats;
  return {
    data: {
      ...stats,
      commits: stats.commits ?? [],
      daily: stats.daily ?? [],
      range: stats.range ?? { dateFrom: range.dateFrom, dateTo: range.dateTo },
    },
    error: null,
  };
}
