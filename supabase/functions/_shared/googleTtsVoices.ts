export type GoogleTtsGender = "FEMALE" | "MALE";

/** Tirage équiprobable M/F (crypto, utilisable côté Edge). */
export function pickRandomTtsGender(): GoogleTtsGender {
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 2 === 0 ? "MALE" : "FEMALE";
}

/** Interprète un genre explicite ; null si absent ou non reconnu. */
export function parseTtsGender(raw: unknown): GoogleTtsGender | null {
  if (raw == null || raw === "RANDOM") return null;
  const s = String(raw).trim().toUpperCase();
  if (s === "MALE" || s === "M") return "MALE";
  if (s === "FEMALE" || s === "F") return "FEMALE";
  return null;
}

const NEURAL2_BY_LANG: Record<string, Record<GoogleTtsGender, string>> = {
  fr: { FEMALE: "fr-FR-Neural2-C", MALE: "fr-FR-Neural2-B" },
  en: { FEMALE: "en-US-Neural2-F", MALE: "en-US-Neural2-D" },
  es: { FEMALE: "es-ES-Neural2-C", MALE: "es-ES-Neural2-B" },
  de: { FEMALE: "de-DE-Neural2-C", MALE: "de-DE-Neural2-B" },
  it: { FEMALE: "it-IT-Neural2-A", MALE: "it-IT-Neural2-C" },
};

const FALLBACK_VOICE = NEURAL2_BY_LANG.fr.FEMALE;

/** Code langue 2 lettres → voix Neural2 Google Cloud TTS. */
export function resolveGoogleTtsVoiceName(lang: string, gender: GoogleTtsGender): string {
  const base = lang.split(/[-_]/)[0].toLowerCase();
  const voices = NEURAL2_BY_LANG[base];
  if (!voices) return FALLBACK_VOICE;
  return voices[gender] ?? voices.FEMALE;
}

/** Extrait le languageCode BCP-47 depuis le nom de voix (ex. fr-FR-Neural2-C → fr-FR). */
export function languageCodeFromVoiceName(voiceName: string): string {
  const parts = voiceName.split("-");
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return "fr-FR";
}
