import { invokeAiWorker } from "@/lib/aiJobs/invokeAiWorker";
import type { MediationUiLang } from "@/lib/artworkDescriptionI18n";
import { supabase } from "@/lib/supabase";

async function fetchJobResultText(jobId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("ai_jobs")
    .select("result")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data) return null;
  const result = (data as { result?: unknown }).result;
  if (result != null && typeof result === "object" && !Array.isArray(result)) {
    const text = (result as { text?: unknown }).text;
    if (typeof text === "string" && text.trim()) return text.trim();
  }
  return null;
}

/**
 * Traduit un titre source vers chaque langue cible via translate_fiche.
 * Les jobs sont créés en parallèle, les workers exécutés séquentiellement.
 */
export async function translateArtworkTitleToLangs(params: {
  sourceText: string;
  sourceLang: MediationUiLang;
  targetLangs: readonly MediationUiLang[];
}): Promise<{
  translations: Partial<Record<MediationUiLang, string>>;
  okCount: number;
  failCount: number;
}> {
  const sourceText = params.sourceText.trim();
  const targetLangs = params.targetLangs.filter((l) => l !== params.sourceLang);
  const translations: Partial<Record<MediationUiLang, string>> = {};
  if (!sourceText || targetLangs.length === 0) {
    return { translations, okCount: 0, failCount: 0 };
  }

  const jobEntries = await Promise.all(
    targetLangs.map(async (targetLang) => {
      const { data, error } = await supabase.functions.invoke("ai-create-job", {
        body: {
          job_type: "translate_fiche",
          payload: {
            sourceLang: params.sourceLang,
            targetLang,
            texteSource: sourceText,
          },
          model: "llama-3.1-8b-instant",
        },
      });
      if (error) {
        console.error(`[translateArtworkTitle] create failed for ${targetLang}`, error);
        return { lang: targetLang, jobId: null as string | null };
      }
      const jobId = (data as { job?: { id?: string } })?.job?.id ?? null;
      return { lang: targetLang, jobId };
    }),
  );

  let okCount = 0;
  let failCount = 0;
  for (const { lang, jobId } of jobEntries) {
    if (!jobId) {
      failCount += 1;
      continue;
    }
    try {
      const result = await invokeAiWorker(jobId);
      if (!result.ok) {
        failCount += 1;
        continue;
      }
      const text = await fetchJobResultText(jobId);
      if (!text) {
        failCount += 1;
        continue;
      }
      translations[lang] = text;
      okCount += 1;
    } catch (e) {
      failCount += 1;
      console.warn(`[translateArtworkTitle] worker ${lang}:`, e);
    }
  }

  return { translations, okCount, failCount };
}
