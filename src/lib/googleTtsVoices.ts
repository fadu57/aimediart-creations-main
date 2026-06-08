export type GoogleTtsGender = "FEMALE" | "MALE";

const NEURAL2_BY_LANG: Record<string, Record<GoogleTtsGender, string>> = {
  fr: { FEMALE: "fr-FR-Neural2-C", MALE: "fr-FR-Neural2-B" },
  en: { FEMALE: "en-US-Neural2-F", MALE: "en-US-Neural2-D" },
  es: { FEMALE: "es-ES-Neural2-C", MALE: "es-ES-Neural2-B" },
  de: { FEMALE: "de-DE-Neural2-C", MALE: "de-DE-Neural2-B" },
  it: { FEMALE: "it-IT-Neural2-A", MALE: "it-IT-Neural2-C" },
};

const FALLBACK_VOICE = NEURAL2_BY_LANG.fr.FEMALE;

/** Code langue 2 lettres → voix Neural2 Google Cloud TTS. */
export function getGoogleTtsVoiceName(lang: string, gender: GoogleTtsGender): string {
  const base = lang.split(/[-_]/)[0].toLowerCase();
  const voices = NEURAL2_BY_LANG[base];
  if (!voices) return FALLBACK_VOICE;
  return voices[gender] ?? voices.FEMALE;
}
