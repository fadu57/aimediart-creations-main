import {
  getMediationFilledUiLangs,
  MEDIATION_UI_LANGS,
  normalizeArtworkDescriptionToByLang,
  type MediationUiLang,
} from "@/lib/artworkDescriptionI18n";

export type ArtworkVoiceCatalogSummary = {
  readyCount: number;
  expectedCount: number;
  langsLabel: string;
  isComplete: boolean;
};

type AudioFileRow = {
  text_id: string;
  lang: string;
  status: string;
  storage_path: string | null;
};

function normLang(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 2);
}

/** Nombre de MP3 attendus (cellules lang×persona × F/M). */
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
  readyFiles: AudioFileRow[],
): MediationUiLang[] {
  const readyByLang = new Set(
    readyFiles
      .filter((f) => f.status === "ready" && f.storage_path)
      .map((f) => normLang(f.lang)),
  );
  return filledLangs.filter((L) => readyByLang.has(L));
}

export function summarizeArtworkMediationVoices(
  artworkId: string,
  descriptionI18n: unknown,
  audioFiles: AudioFileRow[],
): ArtworkVoiceCatalogSummary {
  const expectedCount = countExpectedMediationVoices(descriptionI18n);
  const filledLangs = getMediationFilledUiLangs(descriptionI18n);
  const readyFiles = audioFiles.filter(
    (f) => f.text_id === artworkId && f.status === "ready" && !!f.storage_path?.trim(),
  );
  const readyCount = readyFiles.length;
  const voiceLangs = langsWithReadyVoices(filledLangs, readyFiles);
  const langsLabel = voiceLangs.map((L) => L.toUpperCase()).join(" - ");

  return {
    readyCount,
    expectedCount,
    langsLabel,
    isComplete: expectedCount > 0 && readyCount >= expectedCount,
  };
}

export function buildArtworkVoiceCatalogMap(
  artworks: Array<{ artwork_id: string; artwork_description_i18n?: unknown }>,
  audioFiles: AudioFileRow[],
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
