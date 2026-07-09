import { supabase } from "@/lib/supabase";

export const MAX_ACTIVE_EXPO_EMOTIONS = 6;

export type NewEmotionInput = {
  name_emotion: string;
  Emotion_M?: string;
  icone_emotion: string;
  is_active: boolean;
};

export type ExpoEmotionCatalogRow = {
  id: string;
  name_emotion: string | null;
  Emotion_M: string | null;
  Emotion_F: string | null;
  name_emotion_en: string | null;
  name_emotion_de: string | null;
  name_emotion_es: string | null;
  name_emotion_it: string | null;
  icone_emotion: string | null;
  is_active: boolean;
};

export function getEmotionDisplayLabel(emo: ExpoEmotionCatalogRow, currentLang: string): string {
  const lang = currentLang.split("-")[0].toLowerCase();
  const fallback = (emo.name_emotion ?? "").trim();
  if (lang === "fr") return (emo.Emotion_M ?? "").trim() || fallback;
  if (lang === "en") return (emo.name_emotion_en ?? "").trim() || fallback;
  if (lang === "de") return (emo.name_emotion_de ?? "").trim() || fallback;
  if (lang === "es") return (emo.name_emotion_es ?? "").trim() || fallback;
  if (lang === "it") return (emo.name_emotion_it ?? "").trim() || fallback;
  return fallback || String(emo.id);
}

export async function loadEmotionCatalog(): Promise<ExpoEmotionCatalogRow[]> {
  const { data, error } = await supabase
    .from("emotions")
    .select(
      "id, name_emotion, Emotion_M, Emotion_F, name_emotion_en, name_emotion_de, name_emotion_es, name_emotion_it, icone_emotion, is_active",
    )
    .order("id", { ascending: true });

  if (error) {
    const fallback = await supabase.from("emotions").select("*").order("id", { ascending: true });
    if (fallback.error) throw fallback.error;
    return normalizeEmotionRows((fallback.data as Record<string, unknown>[]) ?? []);
  }

  return normalizeEmotionRows((data as Record<string, unknown>[]) ?? []);
}

function normalizeEmotionRows(rows: Record<string, unknown>[]): ExpoEmotionCatalogRow[] {
  return rows
    .map((row) => ({
      id: String(row.id ?? "").trim(),
      name_emotion: typeof row.name_emotion === "string" ? row.name_emotion : null,
      Emotion_M: typeof row.Emotion_M === "string" ? row.Emotion_M : null,
      Emotion_F: typeof row.Emotion_F === "string" ? row.Emotion_F : null,
      name_emotion_en: typeof row.name_emotion_en === "string" ? row.name_emotion_en : null,
      name_emotion_de: typeof row.name_emotion_de === "string" ? row.name_emotion_de : null,
      name_emotion_es: typeof row.name_emotion_es === "string" ? row.name_emotion_es : null,
      name_emotion_it: typeof row.name_emotion_it === "string" ? row.name_emotion_it : null,
      icone_emotion: typeof row.icone_emotion === "string" ? row.icone_emotion : null,
      is_active: Boolean(row.is_active ?? false),
    }))
    .filter((row) => row.id);
}

export async function saveEmotionActiveStates(
  changes: Array<{ id: string; is_active: boolean }>,
): Promise<void> {
  if (changes.length === 0) return;

  const results = await Promise.all(
    changes.map(({ id, is_active }) =>
      supabase.from("emotions").update({ is_active }).eq("id", id),
    ),
  );

  const failed = results.find((res) => res.error);
  if (failed?.error) throw failed.error;
}

export async function createEmotions(inputs: NewEmotionInput[]): Promise<ExpoEmotionCatalogRow[]> {
  if (inputs.length === 0) return [];

  const payload = inputs.map((input) => {
    const name = input.name_emotion.trim();
    const icon = input.icone_emotion.trim();
    return {
      name_emotion: name,
      Emotion_M: (input.Emotion_M ?? name).trim(),
      icone_emotion: icon,
      is_active: input.is_active,
    };
  });

  const { data, error } = await supabase
    .from("emotions")
    .insert(payload)
    .select(
      "id, name_emotion, Emotion_M, Emotion_F, name_emotion_en, name_emotion_de, name_emotion_es, name_emotion_it, icone_emotion, is_active",
    );

  if (error) throw error;
  return normalizeEmotionRows((data as Record<string, unknown>[]) ?? []);
}

export async function saveEmotionCatalogChanges(options: {
  activeChanges: Array<{ id: string; is_active: boolean }>;
  newEmotions: NewEmotionInput[];
}): Promise<void> {
  const { activeChanges, newEmotions } = options;
  if (newEmotions.length === 0 && activeChanges.length === 0) return;
  await createEmotions(newEmotions);
  await saveEmotionActiveStates(activeChanges);
}

export function countActiveEmotions(activeById: Record<string, boolean>): number {
  return Object.values(activeById).filter(Boolean).length;
}
