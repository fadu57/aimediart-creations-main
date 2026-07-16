import {
  getMediationFilledUiLangs,
  MEDIATION_UI_LANGS,
  normalizeArtworkDescriptionToByLang,
  type MediationUiLang,
} from "@/lib/artworkDescriptionI18n";
import { supabase } from "@/lib/supabase";

export type ArtworkVoiceCatalogSummary = {
  readyCount: number;
  expectedCount: number;
  generatingCount: number;
  langsLabel: string;
  isComplete: boolean;
  /** Au moins une voix en statut pending/generating en base. */
  isGenerating: boolean;
};

export type AudioFileCatalogRow = {
  text_id: string;
  lang: string;
  status: string;
  storage_path: string | null;
};

function normLang(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 2);
}

function normId(raw: string): string {
  return raw.trim().toLowerCase();
}

function isAudioReady(file: Pick<AudioFileCatalogRow, "status" | "storage_path">): boolean {
  const status = (file.status ?? "").trim().toLowerCase();
  return status === "ready" && Boolean(file.storage_path?.trim());
}

/** Nombre de fichiers audio attendus (cellules lang×persona × F/M). */
export function countExpectedMediationVoices(descriptionI18n: unknown): number {
  const byLang = normalizeArtworkDescriptionToByLang(descriptionI18n);
  let total = 0;
  for (const L of MEDIATION_UI_LANGS) {
    for (const text of Object.values(byLang[L])) {
      if ((text ?? "").trim()) total += 2;
    }
  }
  return total;
}

function langsWithReadyVoices(
  filledLangs: MediationUiLang[],
  readyFiles: AudioFileCatalogRow[],
): MediationUiLang[] {
  const readyByLang = new Set(readyFiles.map((f) => normLang(f.lang)));
  return filledLangs.filter((L) => readyByLang.has(L));
}

export function summarizeArtworkMediationVoices(
  artworkId: string,
  descriptionI18n: unknown,
  audioFiles: AudioFileCatalogRow[],
): ArtworkVoiceCatalogSummary {
  const expectedCount = countExpectedMediationVoices(descriptionI18n);
  const filledLangs = getMediationFilledUiLangs(descriptionI18n);
  const artworkIdNorm = normId(artworkId);
  const artworkFiles = audioFiles.filter((f) => normId(f.text_id) === artworkIdNorm);
  const readyFiles = artworkFiles.filter(isAudioReady);
  const readyCount = readyFiles.length;
  const generatingCount = artworkFiles.filter((f) => {
    const status = (f.status ?? "").trim().toLowerCase();
    return status === "generating" || status === "pending";
  }).length;
  const voiceLangs = langsWithReadyVoices(filledLangs, readyFiles);
  const langsLabel = voiceLangs.map((L) => L.toUpperCase()).join(" - ");

  return {
    readyCount,
    expectedCount,
    generatingCount,
    langsLabel,
    isComplete: expectedCount > 0 && readyCount >= expectedCount,
    isGenerating: generatingCount > 0,
  };
}

/**
 * Charge tous les audio_files médiation pour un ensemble d'œuvres.
 * Paginé + découpé : PostgREST tronque souvent à ~1000 lignes sans `.range()`.
 */
export async function fetchMediationAudioFilesForArtworks(
  artworkIds: string[],
): Promise<AudioFileCatalogRow[]> {
  const ids = [...new Set(artworkIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const ID_CHUNK = 80;
  const PAGE_SIZE = 1000;
  const all: AudioFileCatalogRow[] = [];

  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("audio_files")
        .select("text_id, lang, status, storage_path")
        .eq("text_type", "mediation")
        .in("text_id", chunk)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("[artworkVoiceCatalog] audio_files:", error);
        break;
      }

      const rows = (data ?? []) as AudioFileCatalogRow[];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  return all;
}

export function buildArtworkVoiceCatalogMap(
  artworks: Array<{ artwork_id: string; artwork_description_i18n?: unknown }>,
  audioFiles: AudioFileCatalogRow[],
): Record<string, ArtworkVoiceCatalogSummary> {
  const map: Record<string, ArtworkVoiceCatalogSummary> = {};
  for (const aw of artworks) {
    map[aw.artwork_id] = summarizeArtworkMediationVoices(
      aw.artwork_id,
      aw.artwork_description_i18n,
      audioFiles,
    );
  }
  return map;
}
