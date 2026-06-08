/** Préambules fréquents ajoutés par les LLM au lieu de renvoyer uniquement la traduction. */
const TRANSLATION_PREAMBLE_PATTERNS = [
  /^voici la traduction[^:\n]*:\s*/i,
  /^here is the translation[^:\n]*:\s*/i,
  /^la traduction du texte[^:\n]*:\s*/i,
  /^the translation of[^:\n]*:\s*/i,
  /^traduction\s*\([^)]*\)\s*:\s*/i,
  /^translation\s*\([^)]*\)\s*:\s*/i,
  /^traduction\s*:\s*/i,
  /^translation\s*:\s*/i,
  /^übersetzung[^:\n]*:\s*/i,
  /^traducción[^:\n]*:\s*/i,
  /^traduzione[^:\n]*:\s*/i,
];

/**
 * Retire les formules d'introduction (« Voici la traduction… ») des sorties IA.
 * Idempotent : sans effet si le texte est déjà propre.
 */
export function sanitizeTranslationOutput(raw: string): string {
  let text = raw.trim();
  if (!text) return "";

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("«") && text.endsWith("»")) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }

  let prev = "";
  while (prev !== text) {
    prev = text;
    for (const pattern of TRANSLATION_PREAMBLE_PATTERNS) {
      text = text.replace(pattern, "");
    }
    text = text.trim();
  }

  const lines = text.split("\n");
  if (lines.length > 1) {
    const first = lines[0].trim();
    if (
      /^(voici la traduction|here is the translation|la traduction|the translation|traduction|translation|übersetzung|traducción|traduzione)\b/i.test(first) &&
      first.endsWith(":")
    ) {
      text = lines.slice(1).join("\n").trim();
    }
  }

  return text.trim();
}
